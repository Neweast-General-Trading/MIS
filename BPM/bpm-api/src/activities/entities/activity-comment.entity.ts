import { Exclude } from 'class-transformer';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ActivityEntity } from './activity.entity';
import { ActivityCommentAttachmentEntity } from './activity-comment-attachment.entity';

@Entity('activity_comments')
export class ActivityCommentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  activityId: string;

  @ManyToOne(() => ActivityEntity, (activity) => activity.comments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'activityId' })
  @Exclude()
  activity: ActivityEntity;

  @Column({ type: 'varchar', length: 255 })
  author: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  attachmentOriginalName: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  attachmentMimeType: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  attachmentStoredPath: string | null;

  @OneToMany(() => ActivityCommentAttachmentEntity, (attachment) => attachment.comment)
  attachments: ActivityCommentAttachmentEntity[];

  @CreateDateColumn()
  createdAt: Date;
}
