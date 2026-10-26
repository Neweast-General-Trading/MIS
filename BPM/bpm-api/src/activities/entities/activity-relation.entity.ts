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

/** Optional cross-process link between two sub-processes (stored once; shown on both sides). */
@Entity('activity_relations')
@Unique('uq_activity_relations_pair', ['sourceActivityId', 'targetActivityId'])
export class ActivityRelationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Sub-process that initiated the link. */
  @Column({ type: 'uuid' })
  sourceActivityId: string;

  @ManyToOne(() => ActivityEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sourceActivityId' })
  @Exclude()
  sourceActivity: ActivityEntity;

  @Column({ type: 'uuid' })
  targetActivityId: string;

  @ManyToOne(() => ActivityEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'targetActivityId' })
  @Exclude()
  targetActivity: ActivityEntity;

  @CreateDateColumn()
  createdAt: Date;
}
