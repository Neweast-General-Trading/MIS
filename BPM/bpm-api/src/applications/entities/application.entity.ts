import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** An application / system used inside the group (Administration → Application Master). */
@Entity('applications')
export class ApplicationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 160, unique: true })
  name: string;

  @Column({ type: 'varchar', length: 160, nullable: true })
  vendor: string | null;

  @Column({ type: 'varchar', length: 60, default: 'Other' })
  category: string;

  @Column({ type: 'varchar', length: 30, default: 'Cloud' })
  hosting: string;

  @Column({ type: 'varchar', length: 20, default: 'Active' })
  status: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  businessOwner: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  itOwner: string | null;

  @Column({ type: 'varchar', length: 400, nullable: true })
  url: string | null;

  /** BPM company codes that use this application. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  companyCodes: string[];

  @Column({ type: 'varchar', length: 255, nullable: true })
  createdBy: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
