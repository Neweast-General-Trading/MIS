import {
  Column,
  Entity,
  JoinTable,
  ManyToMany,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { PermissionEntity } from './permission.entity';
import { AccessUserEntity } from './user.entity';

@Entity('roles')
@Unique('uq_role_name', ['name'])
export class RoleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Column({ type: 'boolean', default: false })
  fullAccess: boolean;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  /** When non-empty, users with this role (without full access) may only open these process UUIDs. */
  @Column({ type: 'simple-array', default: '' })
  allowedProcessIds: string[];

  @ManyToMany(() => PermissionEntity, (permission) => permission.roles, { eager: true })
  @JoinTable({
    name: 'role_permissions',
    joinColumn: { name: 'roleId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'permissionId', referencedColumnName: 'id' },
  })
  permissions: PermissionEntity[];

  @OneToMany(() => AccessUserEntity, (user) => user.role)
  users: AccessUserEntity[];
}
