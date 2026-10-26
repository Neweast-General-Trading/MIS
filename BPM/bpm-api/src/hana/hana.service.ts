import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import hana from '@sap/hana-client';
import type { Connection } from '@sap/hana-client';

import type {
  HanaCompanyRow,
  HanaCompConnRow,
  HanaDepartmentRow,
  HanaPositionLabelRow,
} from './hana.types';

@Injectable()
export class HanaService {
  isConfigured(): boolean {
    return Boolean(
      process.env.SERVER_NODE?.trim() &&
        process.env.SAP_HANA_USER?.trim() &&
        process.env.SAP_HANA_PASSWORD?.trim(),
    );
  }

  private hanaConfig(schema?: string) {
    return {
      serverNode: process.env.SERVER_NODE!,
      uid: process.env.SAP_HANA_USER!,
      pwd: process.env.SAP_HANA_PASSWORD!,
      currentSchema: schema ?? process.env.SAP_HANA_SCHEMA ?? 'BI_NEGT',
      pooling: true,
      connectionLifetime: 1800,
    };
  }

  private withConnection<T>(schema: string, run: (conn: Connection) => Promise<T>): Promise<T> {
    const conn = hana.createConnection();
    return new Promise((resolve, reject) => {
      conn.connect(this.hanaConfig(schema), async (err) => {
        if (err) {
          reject(err);
          return;
        }
        try {
          resolve(await run(conn));
        } catch (error) {
          reject(error);
        } finally {
          conn.disconnect();
        }
      });
    });
  }

  private exec<T>(conn: Connection, sql: string): Promise<T> {
    return new Promise((resolve, reject) => {
      conn.exec(sql, [], (err, result) => {
        if (err) reject(err);
        else resolve(result as T);
      });
    });
  }

  async fetchCompanies(email: string): Promise<HanaCompanyRow[]> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('SAP HANA is not configured on BPM API.');
    }

    const safeEmail = email.replace(/'/g, "''");
    const sql = `CALL BI_INTRA_MENU('GETBRANCH','','${safeEmail}')`;
    const defaultSchema = process.env.SAP_HANA_SCHEMA ?? 'BI_NEGT';

    return this.withConnection(defaultSchema, async (conn) => {
      const rows = await this.exec<HanaCompanyRow[]>(conn, sql);
      const seen = new Set<string>();
      return (rows ?? []).filter((row) => {
        if (!row?.BRANCH || seen.has(row.BRANCH)) return false;
        seen.add(row.BRANCH);
        return true;
      });
    });
  }

  async resolveCompaniesForUser(candidates: string[]) {
    const tried = new Set<string>();
    for (const candidate of candidates) {
      const email = candidate.trim();
      if (!email) continue;
      const key = email.toLowerCase();
      if (tried.has(key)) continue;
      tried.add(key);

      const companies = await this.fetchCompanies(email);
      if (companies.length > 0) {
        return { email, companies };
      }
    }

    return {
      email: candidates.find((item) => item.trim())?.trim() ?? '',
      companies: [] as HanaCompanyRow[],
    };
  }

  private assertSafeSapSchemaName(schema: string): string {
    const trimmed = schema.trim();
    if (!/^[A-Za-z0-9_]+$/.test(trimmed)) {
      throw new ServiceUnavailableException('Invalid SAP B1 schema name from HANA master data.');
    }
    return trimmed;
  }

  private mergePositionLabels(rows: HanaPositionLabelRow[] | undefined, seen: Set<string>, items: string[]) {
    for (const row of rows ?? []) {
      const label = row?.LABEL?.trim() ?? '';
      if (!label) continue;
      const key = label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(label);
    }
  }

  async resolveSapDbName(hanaBranch: string): Promise<string | null> {
    const branch = hanaBranch?.trim();
    if (!branch) return null;

    const safeBranch = branch.replace(/'/g, "''");
    const sql = `
      SELECT BI_SAPDBNAME
      FROM BI_COMPCONN
      WHERE BI_COMPCODE = '${safeBranch}'
        AND BI_ACTIVE = 'Y'
        AND BI_SAPDBNAME IS NOT NULL
        AND TRIM(BI_SAPDBNAME) <> ''
      LIMIT 1
    `;

    return this.withConnection('BI_COMMON', async (conn) => {
      const rows = await this.exec<HanaCompConnRow[]>(conn, sql);
      const sapDb = rows?.[0]?.BI_SAPDBNAME?.trim() ?? '';
      return sapDb || null;
    });
  }

  /** SAP B1 position master: OHPS (position catalog) + active OHEM job titles per company. */
  async fetchDesignations(hanaBranch?: string): Promise<string[]> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('SAP HANA is not configured on BPM API.');
    }

    const branch = hanaBranch?.trim() || process.env.SAP_HANA_SCHEMA || 'BI_NEGT';
    const sapDb = await this.resolveSapDbName(branch);
    if (!sapDb) return [];

    const safeSap = this.assertSafeSapSchemaName(sapDb);
    const ohpsSql = `
      SELECT DISTINCT
        COALESCE(
          NULLIF(TRIM(TO_NVARCHAR("descriptio")), ''),
          NULLIF(TRIM(TO_NVARCHAR("name")), '')
        ) AS LABEL
      FROM "${safeSap}"."OHPS"
      WHERE COALESCE(
        NULLIF(TRIM(TO_NVARCHAR("descriptio")), ''),
        NULLIF(TRIM(TO_NVARCHAR("name")), '')
      ) IS NOT NULL
      ORDER BY LABEL
    `;
    const ohemSql = `
      SELECT DISTINCT TRIM(TO_NVARCHAR("jobTitle")) AS LABEL
      FROM "${safeSap}"."OHEM"
      WHERE "Active" = 'Y'
        AND "jobTitle" IS NOT NULL
        AND TRIM(TO_NVARCHAR("jobTitle")) <> ''
      ORDER BY LABEL
    `;

    return this.withConnection('BI_COMMON', async (conn) => {
      const seen = new Set<string>();
      const items: string[] = [];

      try {
        const ohpsRows = await this.exec<HanaPositionLabelRow[]>(conn, ohpsSql);
        this.mergePositionLabels(ohpsRows, seen, items);
      } catch {
        // OHPS may be missing for some replicated schemas.
      }

      try {
        const ohemRows = await this.exec<HanaPositionLabelRow[]>(conn, ohemSql);
        this.mergePositionLabels(ohemRows, seen, items);
      } catch {
        // OHEM may be missing for some replicated schemas.
      }

      return items.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    });
  }

  async fetchDepartments(hanaBranch?: string): Promise<HanaDepartmentRow[]> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('SAP HANA is not configured on BPM API.');
    }

    const schema = hanaBranch?.trim() || process.env.SAP_HANA_SCHEMA || 'BI_NEGT';
    const sql = `
      SELECT DISTINCT DEPTCODE, DEPARTMENT
      FROM BI_USERMASTER
      WHERE USER_ACTIVE = 'Y'
        AND USERTYPE = 'U'
        AND DEPARTMENT IS NOT NULL
        AND TO_NVARCHAR(DEPARTMENT) <> ''
      ORDER BY DEPARTMENT
    `;

    return this.withConnection(schema, async (conn) => {
      const rows = await this.exec<HanaDepartmentRow[]>(conn, sql);
      const seen = new Set<number>();
      return (rows ?? []).filter((row) => {
        if (!row?.DEPTCODE || seen.has(row.DEPTCODE)) return false;
        seen.add(row.DEPTCODE);
        return true;
      });
    });
  }
}
