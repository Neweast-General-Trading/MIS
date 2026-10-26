import { Exclude } from 'class-transformer';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ActivityCommentEntity } from './activity-comment.entity';

@Entity('activity_comment_attachments')
export class ActivityCommentAttachmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  commentId: string;

  @ManyToOne(() => ActivityCommentEntity, (comment) => comment.attachments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'commentId' })
  @Exclude()
  comment: ActivityCommentEntity;

  @Column({ type: 'varchar', length: 255 })
  originalName: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  mimeType: string | null;

  @Column({ type: 'varchar', length: 500 })
  storedPath: string;

  @Column({ type: 'varchar', length: 255 })
  storedFileName: string;

  @Column({ type: 'varchar', length: 127 })
  subProcessCode: string;

  @CreateDateColumn()
  createdAt: Date;
}
