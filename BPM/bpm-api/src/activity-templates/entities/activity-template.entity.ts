import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import type { ActivityTemplateFieldType } from 'src/common/activity-template-field-types';

export type ActivityTemplateField = {
  key: string;
  label: string;
  type: ActivityTemplateFieldType;
  openToDiscussion?: boolean;
  options?: string[];
};

@Entity('activity_templates')
export class ActivityTemplateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120, unique: true })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  fields: ActivityTemplateField[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
