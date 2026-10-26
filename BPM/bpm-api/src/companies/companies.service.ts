import {
  BadRequestException,
  ConflictException,
  Injectable,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';

import {
  HANA_MASTER_COMPANIES,
  mapHanaBranchToBpmCode,
  masterCompanyByBranch,
  resolvePrimaryHanaBranchForBpmCode,
} from 'src/hana/company-branch-map';
import { HanaService } from 'src/hana/hana.service';
import { mapOracleLegalEntityNameToBpmCode } from 'src/oracle/oracle-company-map';
import { OracleHcmService } from 'src/oracle/oracle-hcm.service';
import type { OracleLegalEntityRef } from 'src/oracle/oracle-hcm.types';

import type { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { CompanyEntity } from './entities/company.entity';

const SEED_COMPANIES: Array<{ code: string; name: string; sortOrder: number }> =
  [
    { code: 'FZCO', name: 'FZCO', sortOrder: 0 },
    { code: 'NESA', name: 'NESA', sortOrder: 1 },
    { code: 'LLC', name: 'LLC', sortOrder: 2 },
    { code: 'ISUZU', name: 'ISUZU', sortOrder: 3 },
  ];

export type CompanyListItem = {
  code: string;
  /** BPM abbreviation shown in the UI (FZCO, NESA, …). */
  name: string;
  sortOrder: number;
  hanaBranch?: string;
  bpmCode: string;
  /** Oracle Fusion legal employer name. */
  fullName?: string;
  oracleLegalEntityId?: string;
  oracleLegalEntityName?: string;
  oracleBusinessUnitId?: string;
  source: 'oracle' | 'hana' | 'local';
};

@Injectable()
export class CompaniesService implements OnModuleInit {
  private readonly knownCodes = new Set<string>();

  constructor(
    @InjectRepository(CompanyEntity)
    private readonly companyRepository: Repository<CompanyEntity>,
    private readonly hanaService: HanaService,
    private readonly oracleHcmService: OracleHcmService,
  ) {}

  async onModuleInit() {
    await this.ensureSeed();
    await this.refreshCache();
  }

  private async ensureSeed() {
    for (const seed of SEED_COMPANIES) {
      const existing = await this.companyRepository.findOne({
        where: { code: seed.code },
      });
      if (!existing) {
        await this.companyRepository.save(
          this.companyRepository.create({
            code: seed.code,
            name: seed.name,
            sortOrder: seed.sortOrder,
          }),
        );
      }
    }
  }

  private async refreshCache() {
    const rows = await this.companyRepository.find({
      order: { sortOrder: 'ASC', code: 'ASC' },
    });
    this.knownCodes.clear();
    for (const row of rows) {
      this.knownCodes.add(row.code);
    }
  }

  listCodes(): string[] {
    return [...this.knownCodes].sort();
  }

  assertValidCompanyCode(raw: string): void {
    const code = raw?.trim().toUpperCase();
    if (!code || !this.knownCodes.has(code)) {
      const allowed = this.listCodes().join(', ') || '(none)';
      throw new BadRequestException(
        `companyCode must be a registered company (${allowed}).`,
      );
    }
  }

  normalizeCompanyCode(raw: string): string {
    const code = raw?.trim().toUpperCase();
    this.assertValidCompanyCode(code);
    return code;
  }

  listHanaBranches(): Array<{ branch: string; name: string }> {
    return HANA_MASTER_COMPANIES.map((item) => ({
      branch: item.branch,
      name: item.name,
    }));
  }

  /**
   * HANA schema for departments/catalog:
   * 1) company.hanaBranchCode if saved
   * 2) primary branch for BPM code / prefix (FZCO-V1 → BI_NEGT)
   */
  async resolveHanaBranchForBpmCode(bpmCode: string): Promise<string> {
    const code = bpmCode?.trim().toUpperCase();
    if (!code) return '';
    const row = await this.companyRepository.findOne({ where: { code } });
    const stored = row?.hanaBranchCode?.trim();
    if (stored) return stored;
    return resolvePrimaryHanaBranchForBpmCode(code);
  }

  private mapRowToListItem(row: CompanyEntity): CompanyListItem {
    const oracleName = row.oracleLegalEntityName?.trim() || undefined;
    return {
      code: row.code,
      name: row.code,
      sortOrder: row.sortOrder,
      hanaBranch: row.hanaBranchCode ?? undefined,
      bpmCode: row.code,
      fullName: oracleName || (row.name !== row.code ? row.name : undefined),
      oracleLegalEntityId: row.oracleLegalEntityId ?? undefined,
      oracleLegalEntityName: oracleName,
      oracleBusinessUnitId: row.oracleBusinessUnitId ?? undefined,
      source: row.oracleLegalEntityId ? 'oracle' : 'local',
    };
  }

  private async findAllLocal(): Promise<CompanyListItem[]> {
    const rows = await this.companyRepository.find({
      order: { sortOrder: 'ASC', code: 'ASC' },
    });
    return rows.map((row) => this.mapRowToListItem(row));
  }

  private dedupeByBpmCode(items: CompanyListItem[]): CompanyListItem[] {
    const byCode = new Map<string, CompanyListItem>();
    for (const item of items) {
      if (!byCode.has(item.bpmCode)) {
        const hanaBranch =
          item.hanaBranch ||
          resolvePrimaryHanaBranchForBpmCode(item.bpmCode) ||
          undefined;
        byCode.set(item.bpmCode, {
          ...item,
          code: item.bpmCode,
          name: item.bpmCode,
          hanaBranch,
        });
      }
    }
    return [...byCode.values()].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  private async syncOracleLegalEntity(
    ref: OracleLegalEntityRef,
    sortOrder: number,
  ) {
    const bpmCode = mapOracleLegalEntityNameToBpmCode(ref.legalEntityName);
    if (!bpmCode) return;

    const hanaBranch = resolvePrimaryHanaBranchForBpmCode(bpmCode) || null;
    const existing = await this.companyRepository.findOne({
      where: { code: bpmCode },
    });

    if (existing) {
      if (!existing.oracleLegalEntityId) {
        existing.oracleLegalEntityId = ref.legalEntityId;
        existing.oracleLegalEntityName = ref.legalEntityName;
        existing.oracleBusinessUnitId =
          ref.businessUnitId ?? existing.oracleBusinessUnitId;
        existing.name = ref.legalEntityName;
      }
      existing.sortOrder = sortOrder;
      if (!existing.hanaBranchCode && hanaBranch) {
        existing.hanaBranchCode = hanaBranch;
      }
      await this.companyRepository.save(existing);
      this.knownCodes.add(existing.code);
      return;
    }

    await this.companyRepository.save(
      this.companyRepository.create({
        code: bpmCode,
        name: ref.legalEntityName,
        hanaBranchCode: hanaBranch,
        oracleLegalEntityId: ref.legalEntityId,
        oracleLegalEntityName: ref.legalEntityName,
        oracleBusinessUnitId: ref.businessUnitId ?? null,
        sortOrder,
      }),
    );
    this.knownCodes.add(bpmCode);
  }

  private async buildFromOracle(): Promise<CompanyListItem[]> {
    const refs = await this.oracleHcmService.fetchLegalEmployers();
    for (const [index, ref] of refs.entries()) {
      await this.syncOracleLegalEntity(ref, index);
    }
    await this.refreshCache();
    return this.dedupeByBpmCode(await this.findAllLocal());
  }

  private async syncHanaBranch(hanaBranch: string, sortOrder: number) {
    const bpmCode = mapHanaBranchToBpmCode(hanaBranch);
    if (!bpmCode) return;

    const byBranch = await this.companyRepository.findOne({
      where: { hanaBranchCode: hanaBranch },
    });
    if (byBranch) {
      if (!byBranch.oracleLegalEntityName) {
        byBranch.name = bpmCode;
      }
      byBranch.sortOrder = sortOrder;
      await this.companyRepository.save(byBranch);
      this.knownCodes.add(byBranch.code);
      return;
    }

    const existingBpm = await this.companyRepository.findOne({
      where: { code: bpmCode, hanaBranchCode: IsNull() },
    });

    if (existingBpm && !existingBpm.hanaBranchCode) {
      existingBpm.hanaBranchCode = hanaBranch;
      if (!existingBpm.oracleLegalEntityName) {
        existingBpm.name = bpmCode;
      }
      existingBpm.sortOrder = sortOrder;
      await this.companyRepository.save(existingBpm);
      this.knownCodes.add(existingBpm.code);
      return;
    }

    const conflict = await this.companyRepository.findOne({
      where: { code: bpmCode },
    });
    if (conflict) {
      if (!conflict.hanaBranchCode) {
        conflict.hanaBranchCode = hanaBranch;
      }
      if (!conflict.oracleLegalEntityName) {
        conflict.name = bpmCode;
      }
      conflict.sortOrder = sortOrder;
      await this.companyRepository.save(conflict);
      this.knownCodes.add(conflict.code);
      return;
    }

    await this.companyRepository.save(
      this.companyRepository.create({
        code: bpmCode,
        name: bpmCode,
        hanaBranchCode: hanaBranch,
        sortOrder,
      }),
    );
    this.knownCodes.add(bpmCode);
  }

  private async buildFromMasterList(): Promise<CompanyListItem[]> {
    const items: CompanyListItem[] = [];
    for (const [index, row] of HANA_MASTER_COMPANIES.entries()) {
      const hanaBranch = row.branch.trim();
      const bpmCode = mapHanaBranchToBpmCode(hanaBranch);
      await this.syncHanaBranch(hanaBranch, index);
      items.push({
        code: bpmCode,
        name: bpmCode,
        fullName: row.name.trim() || undefined,
        sortOrder: index,
        hanaBranch,
        bpmCode,
        source: 'hana',
      });
    }
    await this.refreshCache();
    return this.dedupeByBpmCode(items);
  }

  private mapHanaRowsToItems(
    companies: Array<{ BRANCH: string; COMPANY: string }>,
  ): CompanyListItem[] {
    return companies.map((row, index) => {
      const hanaBranch = row.BRANCH.trim();
      const bpmCode = mapHanaBranchToBpmCode(hanaBranch);
      const master = masterCompanyByBranch(hanaBranch);
      const fullName = row.COMPANY?.trim() || master?.name || undefined;
      return {
        code: bpmCode,
        name: bpmCode,
        fullName,
        sortOrder: index,
        hanaBranch,
        bpmCode,
        source: 'hana' as const,
      };
    });
  }

  async findAllForUser(userEmail?: string | null): Promise<CompanyListItem[]> {
    if (this.oracleHcmService.isConfigured()) {
      try {
        return await this.buildFromOracle();
      } catch {
        // Fall through to HANA/local.
      }
    }

    if (!this.hanaService.isConfigured()) {
      return this.findAllLocal();
    }

    try {
      const candidates = [
        userEmail?.trim() ?? '',
        process.env.DEFAULT_BI_EMAIL?.trim() ?? '',
      ].filter(Boolean);

      const { companies } = candidates.length
        ? await this.hanaService.resolveCompaniesForUser(candidates)
        : { companies: [] as Array<{ BRANCH: string; COMPANY: string }> };

      const rows = companies.length
        ? companies
        : HANA_MASTER_COMPANIES.map((item) => ({
            BRANCH: item.branch,
            COMPANY: item.name,
          }));

      const items = this.mapHanaRowsToItems(rows);
      for (const [index, item] of items.entries()) {
        if (item.hanaBranch) {
          await this.syncHanaBranch(item.hanaBranch, index);
        }
      }
      await this.refreshCache();
      return this.dedupeByBpmCode(items);
    } catch {
      return this.buildFromMasterList();
    }
  }

  /**
   * Company name for documents: the full legal name only (Oracle legal entity,
   * else SAP HANA master), falling back to the BPM code when none is stored.
   */
  async describeCompany(code: string | null | undefined): Promise<string> {
    const normalized = code?.trim().toUpperCase();
    if (!normalized) return '';
    const row = await this.companyRepository.findOne({
      where: { code: normalized },
    });
    if (!row) return normalized;
    const hana = row.hanaBranchCode
      ? masterCompanyByBranch(row.hanaBranchCode)?.name
      : '';
    const legal =
      row.oracleLegalEntityName?.trim() ||
      hana?.trim() ||
      (row.name?.trim() !== row.code ? row.name?.trim() : '') ||
      '';
    return legal || row.code;
  }

  async findAll(userEmail?: string | null) {
    return this.findAllForUser(userEmail);
  }

  resolveBpmCode(selection: string): string {
    const raw = selection?.trim();
    if (!raw) return '';
    if (this.knownCodes.has(raw.toUpperCase())) {
      return raw.toUpperCase();
    }
    return mapHanaBranchToBpmCode(raw);
  }

  async listOracleLegalEntities() {
    if (!this.oracleHcmService.isConfigured()) {
      return [];
    }
    try {
      return await this.oracleHcmService.listLegalEmployersCatalog();
    } catch {
      return [];
    }
  }

  private async applyOracleLegalEntityLink(
    company: CompanyEntity,
    oracleLegalEntityId?: string | null,
  ) {
    const raw = oracleLegalEntityId?.trim() ?? '';
    if (!raw) {
      company.oracleLegalEntityId = null;
      company.oracleLegalEntityName = null;
      company.oracleBusinessUnitId = null;
      return;
    }

    if (!this.oracleHcmService.isConfigured()) {
      throw new BadRequestException(
        'Oracle HCM is not configured — cannot link a legal entity.',
      );
    }

    const ref = await this.oracleHcmService.resolveLegalEntityRef(raw);
    if (!ref) {
      throw new BadRequestException('Oracle legal entity was not found.');
    }

    company.oracleLegalEntityId = ref.legalEntityId;
    company.oracleLegalEntityName = ref.legalEntityName;
    company.oracleBusinessUnitId = ref.businessUnitId ?? null;
  }

  async update(code: string, dto: UpdateCompanyDto) {
    const normalized = code.trim().toUpperCase();
    const company = await this.companyRepository.findOne({
      where: { code: normalized },
    });
    if (!company) {
      throw new BadRequestException(`Company "${normalized}" was not found.`);
    }

    if (dto.name !== undefined) {
      company.name = dto.name.trim() || company.code;
    }

    if (dto.oracleLegalEntityId !== undefined) {
      await this.applyOracleLegalEntityLink(company, dto.oracleLegalEntityId);
    }

    if (dto.hanaBranchCode !== undefined) {
      const branch = dto.hanaBranchCode?.trim() || '';
      if (!branch) {
        company.hanaBranchCode = null;
      } else {
        const allowed = HANA_MASTER_COMPANIES.some(
          (item) => item.branch.toUpperCase() === branch.toUpperCase(),
        );
        if (!allowed) {
          throw new BadRequestException(
            `Unknown HANA branch "${branch}". Pick a company from the HANA master list.`,
          );
        }
        company.hanaBranchCode = branch.toUpperCase();
        // If display name is still just the code, adopt the HANA company label.
        if (
          !dto.name?.trim() &&
          (!company.name || company.name === company.code)
        ) {
          const master = masterCompanyByBranch(company.hanaBranchCode);
          if (master?.name) company.name = master.name;
        }
      }
    }

    const saved = await this.companyRepository.save(company);
    await this.refreshCache();
    return this.mapRowToListItem(saved);
  }

  async create(dto: CreateCompanyDto) {
    const code = dto.code.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_-]{1,15}$/.test(code)) {
      throw new BadRequestException(
        'Code must be 2–16 characters, start with a letter, and use A–Z, 0–9, underscore, or hyphen.',
      );
    }

    const existing = await this.companyRepository.findOne({ where: { code } });
    if (existing) {
      throw new ConflictException(`Company code "${code}" already exists.`);
    }

    const maxOrder = await this.companyRepository
      .createQueryBuilder('c')
      .select('MAX(c.sortOrder)', 'max')
      .getRawOne<{ max: string | null }>();
    const sortOrder = (Number(maxOrder?.max) || 0) + 1;

    const company = this.companyRepository.create({
      code,
      name: dto.name?.trim() || code,
      sortOrder,
      hanaBranchCode: resolvePrimaryHanaBranchForBpmCode(code) || null,
    });

    if (dto.oracleLegalEntityId?.trim()) {
      await this.applyOracleLegalEntityLink(company, dto.oracleLegalEntityId);
      if (!dto.name?.trim() && company.oracleLegalEntityName) {
        company.name = company.oracleLegalEntityName;
      }
    }

    const saved = await this.companyRepository.save(company);

    await this.refreshCache();

    return this.mapRowToListItem(saved);
  }
}
