import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { RoleEntity } from './role.entity';

@Entity('access_users')
@Unique('uq_access_user_email', ['email'])
export class AccessUserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 160 })
  email: string;

  @Column({ type: 'varchar', length: 120 })
  displayName: string;

  @Column({ type: 'uuid' })
  roleId: string;

  @Column({ type: 'boolean', default: false })
  fullAccess: boolean;

  @Column({ type: 'simple-array', default: '' })
  departmentIds: string[];

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  /** bcrypt hash; null = login via legacy dev header only until password is set */
  @Column({ type: 'varchar', length: 255, nullable: true })
  passwordHash: string | null;

  @ManyToOne(() => RoleEntity, (role) => role.users, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'roleId' })
  role: RoleEntity;
}
