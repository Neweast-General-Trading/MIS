import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { readFile } from 'node:fs/promises';

import { defaultPolicyCreatorUrl } from 'src/departments/activity-policy-links.util';

import {
  buildPolicyDocumentMeta,
  type PolicyDocumentMeta,
  type StoredApprovalStep,
} from './policy-creator-document-meta';

type StoredPolicyCompany = {
  companyCode?: string;
  companyName?: string;
};

type StoredPolicyRow = {
  id?: string;
  name?: string;
  companyCode?: string;
  companyName?: string;
  companies?: StoredPolicyCompany[];
  visibilityScope?: string;
  departmentCode?: number | string;
  departmentName?: string;
  version?: number;
  status?: string;
  isActive?: boolean;
  businessRole?: string;
  sections?: Array<{
    id?: string;
    title?: string;
    content?: string;
    businessRules?: string[];
  }>;
  createdAt?: string;
  createdByName?: string;
  submittedAt?: string;
  approvedAt?: string;
  publishedAt?: string;
  updatedAt?: string;
  approvalSteps?: StoredApprovalStep[];
  processCode?: string;
  processName?: string;
};

export type PolicyCreatorCatalogItem = {
  id: string;
  name: string;
  version: number | null;
  status: string;
  companyCode: string;
  companyName: string;
  departmentCode: number;
  departmentName: string;
  visibilityScope: 'general' | 'department';
  policyCreatorUrl: string;
};

export type PolicyCreatorPolicyDocument = PolicyCreatorCatalogItem & {
  businessRole: string;
  sections: Array<{
    id: string;
    title: string;
    content: string;
    businessRules: string[];
  }>;
  documentMeta: PolicyDocumentMeta;
  processCode: string;
  processName: string;
};

@Injectable()
export class PolicyCreatorCatalogService {
  private readonly logger = new Logger(PolicyCreatorCatalogService.name);

  private policiesPath(): string {
    return (
      process.env.POLICY_CREATOR_POLICIES_PATH?.trim() ||
      '/home/negt/policy_creator/server/data/policies.json'
    );
  }

  async listPolicies(filters: {
    companyCode: string;
    departmentCode: number;
    departmentName?: string;
  }): Promise<PolicyCreatorCatalogItem[]> {
    const rows = await this.readPolicies();
    const companyCode = filters.companyCode.trim();
    const departmentCode = Number(filters.departmentCode);
    const departmentName = filters.departmentName?.trim() ?? '';

    return rows
      .filter((row) =>
        this.matchesScope(row, companyCode, departmentCode, departmentName),
      )
      .map((row) => this.toCatalogItem(row, companyCode))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getPolicyDocument(
    policyId: string,
  ): Promise<PolicyCreatorPolicyDocument> {
    const id = policyId.trim();
    const rows = await this.readPolicies();
    const row = rows.find((item) => String(item.id ?? '').trim() === id);
    if (!row || row.isActive === false) {
      throw new NotFoundException('Policy not found in Policy Creator.');
    }
    const catalog = this.toCatalogItem(
      row,
      String(row.companyCode ?? '').trim(),
    );
    return {
      ...catalog,
      businessRole: String(row.businessRole ?? '').trim(),
      sections: (row.sections ?? []).map((section, index) => ({
        id: String(section.id ?? '').trim() || `section-${index + 1}`,
        title: String(section.title ?? '').trim() || `Section ${index + 1}`,
        content: String(section.content ?? ''),
        businessRules: (Array.isArray(section.businessRules)
          ? section.businessRules
          : []
        )
          .map((rule) => String(rule ?? '').trim())
          .filter(Boolean),
      })),
      documentMeta: buildPolicyDocumentMeta(row),
      processCode: String(row.processCode ?? '').trim(),
      processName: String(row.processName ?? '').trim(),
    };
  }

  private matchesScope(
    row: StoredPolicyRow,
    companyCode: string,
    departmentCode: number,
    departmentName: string,
  ): boolean {
    if (row.isActive === false) {
      return false;
    }
    if (!this.appliesToCompany(row, companyCode)) {
      return false;
    }

    const visibility =
      row.visibilityScope === 'general' ? 'general' : 'department';
    if (
      visibility === 'general' &&
      String(row.status ?? '').trim() === 'published'
    ) {
      return true;
    }

    if (Number(row.departmentCode ?? 0) === departmentCode) {
      return true;
    }

    const policyDept = String(row.departmentName ?? '')
      .trim()
      .toLowerCase();
    return (
      Boolean(departmentName) && policyDept === departmentName.toLowerCase()
    );
  }

  private appliesToCompany(row: StoredPolicyRow, companyCode: string): boolean {
    const companies = this.policyCompanies(row);
    return companies.some((item) => item.companyCode === companyCode);
  }

  private policyCompanies(row: StoredPolicyRow): Array<{
    companyCode: string;
    companyName: string;
  }> {
    if (row.companies?.length) {
      return row.companies
        .map((item) => ({
          companyCode: String(item.companyCode ?? '').trim(),
          companyName:
            String(item.companyName ?? '').trim() ||
            String(item.companyCode ?? '').trim(),
        }))
        .filter((item) => item.companyCode);
    }
    const companyCode = String(row.companyCode ?? '').trim();
    if (!companyCode) {
      return [];
    }
    return [
      {
        companyCode,
        companyName: String(row.companyName ?? '').trim() || companyCode,
      },
    ];
  }

  private toCatalogItem(
    row: StoredPolicyRow,
    selectedCompanyCode: string,
  ): PolicyCreatorCatalogItem {
    const companies = this.policyCompanies(row);
    const selected =
      companies.find((item) => item.companyCode === selectedCompanyCode) ??
      companies[0];
    const id = String(row.id ?? '').trim();
    return {
      id,
      name: String(row.name ?? '').trim() || 'Untitled Policy',
      version: Number.isFinite(Number(row.version))
        ? Number(row.version)
        : null,
      status: String(row.status ?? '').trim() || 'draft',
      companyCode:
        selected?.companyCode ?? String(row.companyCode ?? '').trim(),
      companyName:
        selected?.companyName ?? String(row.companyName ?? '').trim(),
      departmentCode: Number(row.departmentCode ?? 0),
      departmentName: String(row.departmentName ?? '').trim(),
      visibilityScope:
        row.visibilityScope === 'general' ? 'general' : 'department',
      policyCreatorUrl: defaultPolicyCreatorUrl(id),
    };
  }

  private async readPolicies(): Promise<StoredPolicyRow[]> {
    const path = this.policiesPath();
    try {
      const raw = await readFile(path, 'utf8');
      const parsed = JSON.parse(raw) as StoredPolicyRow[];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      this.logger.warn(
        `Could not read Policy Creator store at ${path}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }
  }
}
