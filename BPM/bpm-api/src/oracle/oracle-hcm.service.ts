import { Injectable, ServiceUnavailableException } from '@nestjs/common';

import {
  mapOracleLegalEntityNameToBpmCode,
  oracleLegalEntityNamesMatch,
} from './oracle-company-map';
import type {
  OracleDepartmentRef,
  OracleDepartmentRow,
  OracleJobRow,
  OracleLegalEmployerRow,
  OracleLegalEntityRef,
  OracleListResponse,
  OraclePositionRow,
} from './oracle-hcm.types';

@Injectable()
export class OracleHcmService {
  private businessUnitByLegalEntity = new Map<string, string>();
  private businessUnitCacheAt = 0;
  private readonly businessUnitCacheTtlMs = 6 * 60 * 60 * 1000;

  /** Short-lived cache for the (rarely changing) Jobs / Positions lists. */
  private readonly catalogTtlMs = 10 * 60 * 1000;
  private jobsCache: { at: number; rows: OracleJobRow[] } | null = null;
  private positionsCache: { at: number; rows: OraclePositionRow[] } | null = null;

  private async cachedJobs(): Promise<OracleJobRow[]> {
    if (this.jobsCache && Date.now() - this.jobsCache.at < this.catalogTtlMs) {
      return this.jobsCache.rows;
    }
    const rows = await this.fetchAllPages<OracleJobRow>('jobs');
    this.jobsCache = { at: Date.now(), rows };
    return rows;
  }

  private async cachedPositions(): Promise<OraclePositionRow[]> {
    if (
      this.positionsCache &&
      Date.now() - this.positionsCache.at < this.catalogTtlMs
    ) {
      return this.positionsCache.rows;
    }
    const rows = await this.fetchAllPages<OraclePositionRow>('positions');
    this.positionsCache = { at: Date.now(), rows };
    return rows;
  }

  isConfigured(): boolean {
    return Boolean(
      process.env.ORACLE_HCM_BASE_URL?.trim() &&
        process.env.ORACLE_HCM_USER?.trim() &&
        process.env.ORACLE_HCM_PASSWORD?.trim(),
    );
  }

  private baseUrl(): string {
    const raw = process.env.ORACLE_HCM_BASE_URL?.trim() ?? '';
    return raw.replace(/\/+$/, '');
  }

  private authHeader(): string {
    const user = process.env.ORACLE_HCM_USER!.trim();
    const pass = process.env.ORACLE_HCM_PASSWORD!;
    return `Basic ${Buffer.from(`${user}:${pass}`, 'utf8').toString('base64')}`;
  }

  private async fetchJson<T>(path: string, query: Record<string, string | number> = {}): Promise<T> {
    const url = new URL(`${this.baseUrl()}/${path.replace(/^\/+/, '')}`);
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, String(value));
    }

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Authorization: this.authHeader(),
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new ServiceUnavailableException(
        `Oracle HCM request failed (${response.status})${body ? `: ${body.slice(0, 180)}` : ''}`,
      );
    }

    return (await response.json()) as T;
  }

  private async fetchAllPages<T>(path: string, pageSize = 500): Promise<T[]> {
    const items: T[] = [];
    let offset = 0;

    while (true) {
      const page = await this.fetchJson<OracleListResponse<T>>(path, {
        onlyData: 'true',
        limit: pageSize,
        offset,
      });
      const batch = page.items ?? [];
      items.push(...batch);
      if (batch.length < pageSize) break;
      offset += pageSize;
      if (page.hasMore === false) break;
    }

    return items;
  }

  async fetchLegalEmployers(): Promise<OracleLegalEntityRef[]> {
    return this.listLegalEmployersCatalog({ mappedBpmOnly: true });
  }

  /** All active Oracle legal employers — for company settings picker. */
  async listLegalEmployersCatalog(options?: { mappedBpmOnly?: boolean }): Promise<OracleLegalEntityRef[]> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('Oracle HCM is not configured on BPM API.');
    }

    const mappedBpmOnly = options?.mappedBpmOnly ?? false;
    const rows = await this.fetchAllPages<OracleLegalEmployerRow>('legalEmployers');
    const refs: OracleLegalEntityRef[] = [];

    for (const row of rows) {
      const legalEntityName = row.Name?.trim() ?? '';
      if (!legalEntityName || row.ActiveStatus !== 'A') continue;
      if (mappedBpmOnly && !mapOracleLegalEntityNameToBpmCode(legalEntityName)) continue;

      refs.push({
        legalEntityId: String(row.LegalEntityId ?? row.OrganizationId ?? ''),
        legalEntityName,
        organizationCode: row.OrganizationCode?.trim() || undefined,
      });
    }

    await this.ensureBusinessUnitMap();
    for (const ref of refs) {
      ref.businessUnitId = this.resolveBusinessUnitId(ref.legalEntityName) ?? undefined;
    }

    return refs.sort((a, b) => a.legalEntityName.localeCompare(b.legalEntityName));
  }

  async resolveLegalEntityRef(legalEntityId: string): Promise<OracleLegalEntityRef | null> {
    const id = legalEntityId.trim();
    if (!id) return null;
    const catalog = await this.listLegalEmployersCatalog();
    return catalog.find((item) => item.legalEntityId === id) ?? null;
  }

  private async ensureBusinessUnitMap(force = false) {
    const now = Date.now();
    if (!force && this.businessUnitByLegalEntity.size > 0 && now - this.businessUnitCacheAt < this.businessUnitCacheTtlMs) {
      return;
    }

    type WorkerPage = OracleListResponse<{
      workRelationships?: Array<{
        LegalEmployerName?: string;
        assignments?: Array<{
          BusinessUnitId?: number;
          BusinessUnitName?: string;
          PrimaryAssignmentFlag?: boolean;
        }>;
      }>;
    }>;

    const map = new Map<string, string>();
    let offset = 0;
    const limit = 100;

    while (offset < 500) {
      const page = await this.fetchJson<WorkerPage>('workers', {
        onlyData: 'true',
        limit,
        offset,
        expand: 'workRelationships.assignments',
      });

      for (const worker of page.items ?? []) {
        for (const relationship of worker.workRelationships ?? []) {
          const employer = relationship.LegalEmployerName?.trim() ?? '';
          if (!employer) continue;
          for (const assignment of relationship.assignments ?? []) {
            if (!assignment.BusinessUnitId) continue;
            const buId = String(assignment.BusinessUnitId);
            if (!map.has(employer.toLowerCase())) {
              map.set(employer.toLowerCase(), buId);
            }
          }
        }
      }

      const batchLen = page.items?.length ?? 0;
      if (batchLen < limit) break;
      offset += limit;
    }

    this.businessUnitByLegalEntity = map;
    this.businessUnitCacheAt = now;
  }

  resolveBusinessUnitId(legalEntityName: string): string | null {
    const target = legalEntityName.trim().toLowerCase();
    if (!target) return null;

    const direct = this.businessUnitByLegalEntity.get(target);
    if (direct) return direct;

    for (const [name, buId] of this.businessUnitByLegalEntity.entries()) {
      if (oracleLegalEntityNamesMatch(name, target)) return buId;
    }

    return null;
  }

  async fetchDesignations(businessUnitId?: string | null): Promise<string[]> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('Oracle HCM is not configured on BPM API.');
    }

    const positions = await this.cachedPositions();
    const buFilter = businessUnitId?.trim() ?? '';
    const seen = new Set<string>();
    const items: string[] = [];

    for (const row of positions) {
      if (row.ActiveStatus !== 'A') continue;
      const name = row.Name?.trim() ?? '';
      if (!name) continue;
      if (buFilter && String(row.BusinessUnitId ?? '') !== buFilter) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(name);
    }

    return items.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }

  /** Active Oracle HCM Jobs (job roles) — not positions/designations. */
  async fetchJobRoles(): Promise<string[]> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('Oracle HCM is not configured on BPM API.');
    }

    const jobs = await this.cachedJobs();
    const seen = new Set<string>();
    const items: string[] = [];

    for (const row of jobs) {
      if (row.ActiveStatus !== 'A') continue;
      const name = row.Name?.trim() ?? '';
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(name);
    }

    return items.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }

  async fetchAllActiveDepartments(): Promise<OracleDepartmentRef[]> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('Oracle HCM is not configured on BPM API.');
    }

    const rows = await this.fetchAllPages<OracleDepartmentRow>('departments');
    const seen = new Set<string>();
    const items: OracleDepartmentRef[] = [];

    for (const row of rows) {
      if (row.ActiveStatus !== 'A') continue;
      const departmentName = row.Name?.trim() || row.Title?.trim() || '';
      const departmentId = String(row.OrganizationId ?? '');
      if (!departmentId || !departmentName) continue;
      if (seen.has(departmentId)) continue;
      seen.add(departmentId);
      items.push({ departmentId, departmentName });
    }

    return items.sort((a, b) =>
      a.departmentName.localeCompare(b.departmentName, undefined, { sensitivity: 'base' }),
    );
  }

  async fetchDepartmentsForCompany(
    legalEntityName?: string | null,
    businessUnitId?: string | null,
  ): Promise<OracleDepartmentRef[]> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('Oracle HCM is not configured on BPM API.');
    }

    const map = await this.fetchDepartmentsGroupedByLegalEntity();
    const name = legalEntityName?.trim() ?? '';
    if (name) {
      const scoped = this.resolveDepartmentsFromMap(map, name);
      if (scoped.length) return scoped;
    }

    void businessUnitId;
    return this.fetchAllActiveDepartments();
  }

  /** One worker scan — departments grouped by legal employer (for admin comparison). */
  async fetchDepartmentsGroupedByLegalEntity(): Promise<Map<string, OracleDepartmentRef[]>> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('Oracle HCM is not configured on BPM API.');
    }

    type WorkerPage = OracleListResponse<{
      workRelationships?: Array<{
        LegalEmployerName?: string;
        assignments?: Array<{
          DepartmentId?: number;
          DepartmentName?: string;
        }>;
      }>;
    }>;

    const map = new Map<string, Map<string, OracleDepartmentRef>>();
    let offset = 0;
    const limit = 100;

    while (offset < 2000) {
      const page = await this.fetchJson<WorkerPage>('workers', {
        onlyData: 'true',
        limit,
        offset,
        expand: 'workRelationships.assignments',
      });

      for (const worker of page.items ?? []) {
        for (const relationship of worker.workRelationships ?? []) {
          const employer = relationship.LegalEmployerName?.trim() ?? '';
          if (!employer) continue;
          const employerKey = employer.toLowerCase();
          if (!map.has(employerKey)) {
            map.set(employerKey, new Map());
          }
          const bucket = map.get(employerKey)!;
          for (const assignment of relationship.assignments ?? []) {
            const deptId = assignment.DepartmentId;
            const deptName = assignment.DepartmentName?.trim() ?? '';
            if (!deptId || !deptName) continue;
            const id = String(deptId);
            if (!bucket.has(id)) {
              bucket.set(id, { departmentId: id, departmentName: deptName });
            }
          }
        }
      }

      const batchLen = page.items?.length ?? 0;
      if (batchLen < limit) break;
      offset += limit;
    }

    const grouped = new Map<string, OracleDepartmentRef[]>();
    for (const [employerKey, bucket] of map.entries()) {
      grouped.set(
        employerKey,
        [...bucket.values()].sort((a, b) =>
          a.departmentName.localeCompare(b.departmentName, undefined, { sensitivity: 'base' }),
        ),
      );
    }
    return grouped;
  }

  resolveDepartmentsFromMap(
    grouped: Map<string, OracleDepartmentRef[]>,
    legalEntityName: string,
  ): OracleDepartmentRef[] {
    const target = legalEntityName.trim().toLowerCase();
    if (!target) return [];

    const direct = grouped.get(target);
    if (direct?.length) return direct;

    for (const [name, items] of grouped.entries()) {
      if (oracleLegalEntityNamesMatch(name, target)) return items;
    }

    return [];
  }
}
