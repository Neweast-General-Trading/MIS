import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('companies')
export class CompanyEntity {
  @PrimaryColumn({ type: 'varchar', length: 16 })
  code: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  hanaBranchCode: string | null;

  /** Oracle Fusion HCM legal entity (primary company master). */
  @Column({ type: 'varchar', length: 32, nullable: true })
  oracleLegalEntityId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  oracleLegalEntityName: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  oracleBusinessUnitId: string | null;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
