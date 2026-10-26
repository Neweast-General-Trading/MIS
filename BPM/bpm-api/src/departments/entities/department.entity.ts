import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ProcessEntity } from 'src/processes/entities/process.entity';
import type { CompanyCode } from 'src/processes/company-codes';
import { OrgDepartmentEntity } from './org-department.entity';

@Entity('departments')
/**
 * Process Function code is unique only within the same company.
 * Same code (e.g. "Sales") may co-exist across FZCO / NESA / LLC.
 */
@Unique('uq_departments_company_code', ['companyCode', 'code'])
export class Department {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 11 })
  code: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 16, default: 'FZCO' })
  companyCode: CompanyCode;

  /** Process code format for this process function: 3 => C1-C2-000, 4 => C1-C2-C3-000. */
  @Column({ type: 'int', default: 3 })
  processCodeLevels: number;

  /** Default owners for this process function; saved on folder update and propagated to every process + sub-process. */
  @Column({ type: 'simple-array', default: '' })
  processFunctionOwners: string[];

  /** Organizational department selected from the master org-departments list. */
  @Column({ type: 'uuid', nullable: true })
  orgDepartmentId: string | null;

  /** SAP HANA branch (Policy Creator company) — departments loaded from this schema. */
  @Column({ type: 'varchar', length: 32, nullable: true })
  hanaBranch: string | null;

  /** HANA BI_USERMASTER DEPTCODE — same as Policy Creator department code. */
  @Column({ type: 'int', nullable: true })
  hanaDeptCode: number | null;

  /** HANA department name — must match Policy Creator selection for linking. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  hanaDepartmentName: string | null;

  @ManyToOne(() => OrgDepartmentEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'orgDepartmentId' })
  orgDepartment: OrgDepartmentEntity | null;

  @OneToMany(() => ProcessEntity, (process) => process.department)
  processes: ProcessEntity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
