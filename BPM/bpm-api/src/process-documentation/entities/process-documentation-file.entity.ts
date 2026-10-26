import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Department } from 'src/departments/entities/department.entity';
import { ProcessEntity } from 'src/processes/entities/process.entity';

export type ProcessDocumentationTargetType = 'department' | 'process';
export type ProcessDocumentationSource = 'upload' | 'automation';

@Entity('process_documentation_files')
export class ProcessDocumentationFileEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Process Function (department) — set when targetType is department. */
  @Column({ type: 'uuid', nullable: true })
  departmentId: string | null;

  @ManyToOne(() => Department, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'departmentId' })
  department: Department | null;

  /** Process — set when targetType is process. */
  @Column({ type: 'uuid', nullable: true })
  processId: string | null;

  @ManyToOne(() => ProcessEntity, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'processId' })
  process: ProcessEntity | null;

  @Column({ type: 'varchar', length: 16, default: 'upload' })
  source: ProcessDocumentationSource;

  @Column({ type: 'varchar', length: 64, nullable: true })
  processFunctionCode: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  processCode: string | null;

  @Column({ type: 'text', nullable: true })
  comments: string | null;

  @Column({ type: 'varchar', length: 255 })
  originalName: string;

  @Column({ type: 'varchar', length: 512 })
  storedPath: string;

  @Column({ type: 'varchar', length: 255 })
  storedFileName: string;

  @Column({ type: 'varchar', length: 127, nullable: true })
  mimeType: string | null;

  @Column({ type: 'int', default: 0 })
  fileSize: number;

  @Column({ type: 'varchar', length: 255 })
  uploadedByEmail: string;

  @Column({ type: 'varchar', length: 120 })
  uploadedByName: string;

  @CreateDateColumn()
  createdAt: Date;
}
