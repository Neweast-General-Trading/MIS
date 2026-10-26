import { Exclude } from 'class-transformer';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

import { ActivityEntity } from './activity.entity';

/** Policy Creator policy linked to a BPM sub-process (shown in Relative Policy column). */
@Entity('activity_policy_links')
@Unique('uq_activity_policy_links_pair', ['activityId', 'policyCreatorPolicyId'])
export class ActivityPolicyLinkEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  activityId: string;

  @ManyToOne(() => ActivityEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'activityId' })
  @Exclude()
  activity: ActivityEntity;

  /** Policy Creator policy id (external system). */
  @Column({ type: 'uuid' })
  policyCreatorPolicyId: string;

  @Column({ type: 'varchar', length: 255 })
  policyName: string;

  @Column({ type: 'int', nullable: true })
  policyVersion: number | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  companyCode: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  companyName: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  departmentName: string | null;

  @Column({ type: 'varchar', length: 63, nullable: true })
  processCode: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  processName: string | null;

  @Column({ type: 'varchar', length: 127, nullable: true })
  activityCode: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  policyCreatorUrl: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  linkedBy: string | null;

  @CreateDateColumn()
  linkedAt: Date;
}
