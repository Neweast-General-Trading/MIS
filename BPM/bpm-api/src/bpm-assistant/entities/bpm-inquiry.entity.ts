import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('bpm_inquiries')
export class BpmInquiryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 320 })
  userEmail: string;

  @Column({ type: 'text' })
  question: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  pagePath: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
