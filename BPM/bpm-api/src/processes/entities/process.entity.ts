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
import { ActivityEntity } from 'src/activities/entities/activity.entity';
import { Department } from 'src/departments/entities/department.entity';
import type { CompanyCode } from 'src/processes/company-codes';

@Entity('processes')
/** Process code is unique within a process function (department), not globally. */
@Unique('uq_processes_department_code', ['departmentId', 'code'])
export class ProcessEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  departmentId: string;

  @ManyToOne(() => Department, (department) => department.processes, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'departmentId' })
  department: Department;

  // Keep nullable for legacy rows during schema sync; new writes still validate/populate code.
  @Column({ type: 'varchar', length: 63, nullable: true })
  code: string;

  @Column({ type: 'varchar', length: 255 })
  processName: string;

  @Column({ type: 'varchar', length: 300 })
  name: string;

  @Column({ type: 'varchar', length: 16, default: 'FZCO' })
  companyCode: CompanyCode;

  @Column({ type: 'uuid', nullable: true })
  activityTemplateId: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  activityTemplateName: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  projectName: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'simple-array', default: '' })
  processOwners: string[];

  @Column({ type: 'text', nullable: true })
  processDescription: string | null;

  @OneToMany(() => ActivityEntity, (activity) => activity.process)
  activities: ActivityEntity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
