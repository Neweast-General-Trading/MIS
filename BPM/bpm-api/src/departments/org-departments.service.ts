import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { Department } from './entities/department.entity';
import { OrgDepartmentEntity } from './entities/org-department.entity';

const SEED_ORG_DEPARTMENTS: string[] = [
  'Business & IT',
  'Operation',
  'Audit',
  'Finance',
  'Planning and Procurement',
  'HR',
  'Sales',
  'Marketing & CRM',
  'Logistics',
  'Internal Audit',
  'MASTER DATA',
];

/** Maps process-function code prefix (C1) to a master org department name. */
const CODE_PREFIX_TO_ORG_DEPARTMENT: Record<string, string> = {
  '001': 'Planning and Procurement',
  '002': 'Operation',
  '003': 'Sales',
  '004': 'Logistics',
  '005': 'Finance',
  '006': 'Marketing & CRM',
  '007': 'HR',
  '008': 'Internal Audit',
  '009': 'Audit',
  '010': 'Business & IT',
  '011': 'Operation',
  '012': 'Audit',
  '013': 'Finance',
  '014': 'Planning and Procurement',
  '999': 'MASTER DATA',
};

@Injectable()
export class OrgDepartmentsService implements OnModuleInit {
  constructor(
    @InjectRepository(OrgDepartmentEntity)
    private readonly orgDepartmentRepository: Repository<OrgDepartmentEntity>,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
  ) {}

  async onModuleInit() {
    await this.ensureSeed();
    await this.backfillProcessFunctionLinks();
  }

  private async ensureSeed() {
    for (let index = 0; index < SEED_ORG_DEPARTMENTS.length; index += 1) {
      const name = SEED_ORG_DEPARTMENTS[index];
      const existing = await this.orgDepartmentRepository.findOne({ where: { name } });
      if (!existing) {
        await this.orgDepartmentRepository.save(
          this.orgDepartmentRepository.create({ name, sortOrder: index }),
        );
      }
    }
  }

  private async backfillProcessFunctionLinks() {
    const orgRows = await this.orgDepartmentRepository.find();
    const idByName = new Map(orgRows.map((row) => [row.name.toLowerCase(), row.id]));

    const unlinked = await this.departmentRepository.find({
      where: { orgDepartmentId: IsNull() },
    });

    for (const row of unlinked) {
      const linkedId = this.resolveOrgDepartmentId(row.name, row.code, idByName);
      if (linkedId) {
        row.orgDepartmentId = linkedId;
        await this.departmentRepository.save(row);
      }
    }
  }

  private resolveOrgDepartmentId(
    processFunctionName: string,
    code: string,
    idByName: Map<string, string>,
  ): string | null {
    const normalizedName = processFunctionName.trim().toLowerCase();
    if (normalizedName) {
      const exact = idByName.get(normalizedName);
      if (exact) return exact;

      for (const [name, id] of idByName.entries()) {
        if (
          normalizedName.includes(name) ||
          name.includes(normalizedName.split(/[\s(_-]/)[0] ?? '')
        ) {
          return id;
        }
      }
    }

    const prefix = code.trim().split('-')[0] ?? '';
    const mappedName = CODE_PREFIX_TO_ORG_DEPARTMENT[prefix];
    if (mappedName) {
      return idByName.get(mappedName.toLowerCase()) ?? null;
    }

    return null;
  }

  async findAll() {
    const rows = await this.orgDepartmentRepository.find({
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      sortOrder: row.sortOrder,
    }));
  }

  async assertValidOrgDepartmentId(orgDepartmentId: string): Promise<OrgDepartmentEntity> {
    const row = await this.orgDepartmentRepository.findOne({
      where: { id: orgDepartmentId },
    });
    if (!row) {
      throw new BadRequestException('Invalid department selection.');
    }
    return row;
  }
}
