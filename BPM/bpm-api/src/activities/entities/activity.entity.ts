import { Exclude } from 'class-transformer';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { ActivityCommentEntity } from './activity-comment.entity';
import { ProcessEntity } from 'src/processes/entities/process.entity';

/**
 * One BPM **Sub_Process** (process step row in standards / RACI sheets). Same business concept as **Activity**;
 * `ActivityEntity` is the ORM/table name (`activities`).
 */
@Entity('activities')
/** Sub-process code is unique within a process, not globally. */
@Unique('uq_activities_process_code', ['processId', 'code'])
export class ActivityEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  processId: string;

  @ManyToOne(() => ProcessEntity, (process) => process.activities, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'processId' })
  @Exclude()
  process: ProcessEntity;

  /** When set, this activity is a child sub-process (code extends parent code, e.g. 001-001-002-001). */
  @Column({ type: 'uuid', nullable: true })
  parentActivityId: string | null;

  @ManyToOne(() => ActivityEntity, (activity) => activity.children, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'parentActivityId' })
  @Exclude()
  parent: ActivityEntity | null;

  @OneToMany(() => ActivityEntity, (activity) => activity.parent)
  @Exclude()
  children: ActivityEntity[];

  @Column({ type: 'int' })
  sln: number;

  @Column({ type: 'varchar', length: 127 })
  code: string;

  @Column({ type: 'varchar', length: 255 })
  activityName: string;

  @Column({ type: 'uuid', nullable: true })
  templateId: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  templateName: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  details: Record<string, string | string[]>;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  fieldDiscussion: Record<string, boolean>;

  /**
   * Per-vendor overlay values, keyed by a stable vendor identifier (currently the lowercased
   * email of the user who uploaded). Original Sub-process fields are never overwritten — the
   * vendor entry stores its own copy of activityName / activityDescription / details so the
   * UI can render Original (red highlight) and Vendor (green highlight) side-by-side.
   */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  vendorVersions: Record<
    string,
    {
      vendorName: string;
      submittedBy: string;
      updatedAt: string;
      activityName?: string | null;
      activityDescription?: string | null;
      details: Record<string, string | string[]>;
    }
  >;

  @Column({ type: 'text', nullable: true })
  activityDescription: string | null;

  @Column({ type: 'simple-array', default: '' })
  owners: string[];

  @Column({ type: 'varchar', length: 40, default: 'Draft' })
  status: string;

  @Column({ type: 'boolean', default: false })
  discussionEnabled: boolean;

  @OneToMany(() => ActivityCommentEntity, (comment) => comment.activity)
  comments: ActivityCommentEntity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
