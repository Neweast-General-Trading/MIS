import {
  StreamableFile,
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import { PERMISSIONS } from 'src/access-control/access-control.constants';
import { RequirePermission } from 'src/access-control/permissions.decorator';
import { JwtService } from '@nestjs/jwt';
import { resolveRequestUserEmail } from 'src/common/auth/request-user-email.util';
import { resolvePrimaryHanaBranchForBpmCode } from 'src/hana/company-branch-map';
import { HanaService } from 'src/hana/hana.service';

import { BpmCatalogService } from './bpm-catalog.service';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { PolicyCreatorCatalogService } from './policy-creator-catalog.service';
import { PolicyPdfService } from './policy-pdf.service';

@Controller('companies')
export class CompaniesController {
  constructor(
    private readonly companiesService: CompaniesService,
    private readonly hanaService: HanaService,
    private readonly bpmCatalogService: BpmCatalogService,
    private readonly policyCreatorCatalogService: PolicyCreatorCatalogService,
    private readonly policyPdfService: PolicyPdfService,
    private readonly jwtService: JwtService,
  ) {}

  private resolveEmail(req: Request) {
    try {
      return resolveRequestUserEmail(req, this.jwtService);
    } catch {
      return '';
    }
  }

  @Get()
  @RequirePermission(PERMISSIONS.departments)
  list(@Req() req: Request) {
    const userEmail = this.resolveEmail(req);
    return this.companiesService.findAll(userEmail);
  }

  @Get('oracle/legal-entities')
  @RequirePermission(PERMISSIONS.departments)
  listOracleLegalEntities() {
    return this.companiesService.listOracleLegalEntities();
  }

  @Get('hana/designations')
  @RequirePermission(PERMISSIONS.activities)
  async hanaDesignations(
    @Query('hanaBranch') hanaBranch?: string,
    @Query('bpmCode') bpmCode?: string,
  ) {
    const code =
      bpmCode?.trim().toUpperCase() ||
      this.companiesService.resolveBpmCode(hanaBranch?.trim() ?? '');
    const branch =
      hanaBranch?.trim() || resolvePrimaryHanaBranchForBpmCode(code);
    const designations = await this.bpmCatalogService.listDesignations(
      branch || undefined,
      code || undefined,
    );
    return designations.map((name) => ({
      name,
      bpmCode: code || null,
      hanaBranch: branch || null,
      source: 'oracle' as const,
    }));
  }

  @Get('oracle/job-roles')
  @RequirePermission(PERMISSIONS.activities)
  async oracleJobRoles(
    @Query('hanaBranch') hanaBranch?: string,
    @Query('bpmCode') bpmCode?: string,
  ) {
    const code =
      bpmCode?.trim().toUpperCase() ||
      this.companiesService.resolveBpmCode(hanaBranch?.trim() ?? '');
    const branch =
      hanaBranch?.trim() || resolvePrimaryHanaBranchForBpmCode(code);
    const jobRoles = await this.bpmCatalogService.listJobRoles(
      branch || undefined,
      code || undefined,
    );
    return jobRoles.map((name) => ({
      name,
      bpmCode: code || null,
      hanaBranch: branch || null,
      source: 'oracle' as const,
    }));
  }

  @Get('hana/branches')
  @RequirePermission(PERMISSIONS.departments)
  listHanaBranches() {
    return this.companiesService.listHanaBranches();
  }

  @Get('hana/departments')
  @RequirePermission(PERMISSIONS.departments)
  async hanaDepartments(
    @Query('hanaBranch') hanaBranch?: string,
    @Query('bpmCode') bpmCode?: string,
  ) {
    const branch =
      hanaBranch?.trim() ||
      (await this.companiesService.resolveHanaBranchForBpmCode(
        bpmCode?.trim() ?? '',
      ));
    if (!branch) {
      throw new BadRequestException(
        'No SAP HANA company linked for this BPM code. Open Company details and set HANA company/branch.',
      );
    }
    const departments = await this.hanaService.fetchDepartments(branch);
    return departments.map((dept) => ({
      code: dept.DEPTCODE,
      name: dept.DEPARTMENT?.trim() ?? '',
      hanaBranch: branch,
    }));
  }

  /**
   * Policy Creator store: policies for a HANA company + department
   * (used by BPM "Link to policy" on a sub-process).
   */
  @Get('catalog/policies')
  @RequirePermission(PERMISSIONS.activities)
  catalogPolicies(
    @Query('companyCode') companyCode?: string,
    @Query('departmentCode') departmentCode?: string,
    @Query('departmentName') departmentName?: string,
  ) {
    const company = companyCode?.trim() ?? '';
    const deptCode = Number(departmentCode);
    if (!company || !Number.isFinite(deptCode)) {
      throw new BadRequestException(
        'companyCode and departmentCode are required.',
      );
    }
    return this.policyCreatorCatalogService.listPolicies({
      companyCode: company,
      departmentCode: deptCode,
      departmentName,
    });
  }

  /** The policy as a PDF, shown inline so it opens in a browser tab. */
  @Get('catalog/policies/:policyId/pdf')
  @RequirePermission(PERMISSIONS.departments)
  async catalogPolicyPdf(@Param('policyId') policyId: string) {
    const { buffer, filename } = await this.policyPdfService.render(policyId);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `inline; filename="${filename}.pdf"`,
    });
  }

  @Get('catalog/policies/:policyId')
  @RequirePermission(PERMISSIONS.activities)
  catalogPolicy(@Param('policyId') policyId: string) {
    return this.policyCreatorCatalogService.getPolicyDocument(policyId);
  }

  /**
   * Policy / external-project catalog: requires HANA company branch + department name
   * before processes and sub-processes are returned.
   */
  @Get('catalog/processes')
  @RequirePermission(PERMISSIONS.departments)
  async catalogProcesses(
    @Query('hanaBranch') hanaBranch?: string,
    @Query('departmentName') departmentName?: string,
  ) {
    const branch = hanaBranch?.trim() ?? '';
    const dept = departmentName?.trim() ?? '';
    if (!branch || !dept) {
      throw new BadRequestException(
        'hanaBranch and departmentName are required.',
      );
    }
    return this.bpmCatalogService.listProcessesForPolicyLink(branch, dept);
  }

  @Get('catalog/processes/:processId/sub-processes')
  @RequirePermission(PERMISSIONS.departments)
  async catalogSubProcesses(@Param('processId') processId: string) {
    const rows =
      await this.bpmCatalogService.listSubProcessesForProcess(processId);
    return rows.map((item) => ({
      id: item.id,
      code: item.code,
      name: item.activityName,
      parentActivityId: item.parentActivityId,
    }));
  }

  @Post()
  @RequirePermission(PERMISSIONS.usersPermissions)
  create(@Body() dto: CreateCompanyDto) {
    return this.companiesService.create(dto);
  }

  @Patch(':code')
  @RequirePermission(PERMISSIONS.usersPermissions)
  update(@Param('code') code: string, @Body() dto: UpdateCompanyDto) {
    return this.companiesService.update(code, dto);
  }
}
