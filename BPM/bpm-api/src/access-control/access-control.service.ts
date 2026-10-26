import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { In, Repository } from 'typeorm';
import {
  aiExportAllowedEmails,
  ALL_PERMISSION_KEYS,
  PERMISSIONS,
  type PermissionKey,
} from './access-control.constants';
import { UpsertUserDto } from './dto/upsert-user.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { PermissionEntity } from './entities/permission.entity';
import { RoleEntity } from './entities/role.entity';
import { AccessUserEntity } from './entities/user.entity';
import { Department } from 'src/departments/entities/department.entity';
import type { CompanyCode } from 'src/processes/company-codes';
import {
  findAccessUserByEmail,
  normalizeEmail,
} from 'src/common/auth/access-user-email.util';

/** Bootstrap administrator — preserved when the standard user roster is synced on API startup. */
/**
 * The protected administrator account. Configure with `ADMINISTRATOR_EMAIL`
 * (read lazily so it works regardless of when the .env file is loaded).
 */
export function administratorEmail(): string {
  return process.env.ADMINISTRATOR_EMAIL?.trim() || 'admin@example.com';
}

const BUILTIN_ROLE_NAMES = new Set([
  'Super Admin',
  'Admin',
  'Department Manager',
  'Viewer',
  'Vendor',
]);

@Injectable()
export class AccessControlService implements OnModuleInit {
  constructor(
    @InjectRepository(PermissionEntity)
    private readonly permissionRepository: Repository<PermissionEntity>,
    @InjectRepository(RoleEntity)
    private readonly roleRepository: Repository<RoleEntity>,
    @InjectRepository(AccessUserEntity)
    private readonly userRepository: Repository<AccessUserEntity>,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
  ) {}

  async onModuleInit() {
    await this.ensureSeeds();
    await this.normalizeStoredEmails();
  }

  /** One-time safety pass: legacy rows may have mixed-case emails. */
  private async normalizeStoredEmails() {
    await this.userRepository
      .createQueryBuilder()
      .update(AccessUserEntity)
      .set({ email: () => 'LOWER(TRIM(email))' })
      .where('email <> LOWER(TRIM(email))')
      .execute();
  }

  private findUserByEmail(
    email: string,
    options?: {
      relations?: {
        role?: boolean;
        permissions?: boolean;
      };
    },
  ) {
    return findAccessUserByEmail(this.userRepository, email, options);
  }

  async userHasPermission(email: string, permission: PermissionKey) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) return false;

    const user = await this.findUserByEmail(normalizedEmail, {
      relations: { role: true, permissions: true },
    });
    if (!user) return false;
    if (!user.enabled || !user.role?.enabled) return false;
    if (user.fullAccess || user.role.fullAccess) return true;
    return (user.role.permissions ?? []).some(
      (item) => item.key === permission,
    );
  }

  /** Super-admin / role full access — required for destructive maintenance (e.g. purge BPM data). */
  async userHasFullAccess(email: string): Promise<boolean> {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) return false;
    const user = await this.findUserByEmail(normalizedEmail, {
      relations: { role: true },
    });
    if (!user) return false;
    if (!user.enabled || !user.role?.enabled) return false;
    return !!(user.fullAccess || user.role.fullAccess);
  }

  /** Super Admin, or an enabled user whose email is on the AI allow-list. */
  async userCanUseAi(email: string): Promise<boolean> {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) return false;
    const user = await this.findUserByEmail(normalizedEmail, {
      relations: { role: true },
    });
    if (!user || !user.enabled || !user.role?.enabled) return false;
    return (
      user.role.name === 'Super Admin' ||
      aiExportAllowedEmails().has(normalizedEmail)
    );
  }

  async userIsSuperAdmin(email: string): Promise<boolean> {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) return false;
    const user = await this.findUserByEmail(normalizedEmail, {
      relations: { role: true },
    });
    if (!user) return false;
    if (!user.enabled || !user.role?.enabled) return false;
    return user.role.name === 'Super Admin';
  }

  async getRoles() {
    const roles = await this.roleRepository.find({ order: { name: 'ASC' } });
    return roles.map((role) => ({
      id: role.id,
      name: role.name,
      fullAccess: role.fullAccess,
      enabled: role.enabled,
      permissions: (role.permissions ?? []).map((item) => item.key),
      allowedProcessIds: [...(role.allowedProcessIds ?? [])],
    }));
  }

  async updateRole(id: string, input: UpdateRoleDto) {
    const role = await this.roleRepository.findOne({
      where: { id },
      relations: { permissions: true },
    });
    if (!role) {
      throw new NotFoundException('Role not found.');
    }
    if (role.name === 'Super Admin' && input.enabled === false) {
      throw new BadRequestException('The Super Admin role cannot be disabled.');
    }

    if (input.name !== undefined) {
      const nextName = input.name.trim();
      if (!nextName) {
        throw new BadRequestException('Role name cannot be empty.');
      }
      if (role.name === 'Super Admin' && nextName !== 'Super Admin') {
        throw new BadRequestException(
          'The Super Admin role cannot be renamed.',
        );
      }
      if (nextName !== role.name) {
        const taken = await this.roleRepository.findOne({
          where: { name: nextName },
        });
        if (taken && taken.id !== role.id) {
          throw new ConflictException(
            `A role named "${nextName}" already exists.`,
          );
        }
        role.name = nextName;
      }
    }

    if (input.enabled !== undefined) {
      role.enabled = input.enabled;
    }
    if (input.allowedProcessIds !== undefined) {
      role.allowedProcessIds = [...input.allowedProcessIds];
    }
    if (input.permissionKeys !== undefined) {
      const perms = await this.permissionRepository.find({
        where: { key: In(input.permissionKeys) },
      });
      if (perms.length !== input.permissionKeys.length) {
        throw new BadRequestException(
          'One or more permission keys are invalid.',
        );
      }
      role.permissions = perms;
    }

    await this.roleRepository.save(role);
    const refreshed = await this.roleRepository.findOne({
      where: { id },
      relations: { permissions: true },
    });
    if (!refreshed) {
      throw new NotFoundException('Role not found.');
    }
    return {
      id: refreshed.id,
      name: refreshed.name,
      fullAccess: refreshed.fullAccess,
      enabled: refreshed.enabled,
      permissions: (refreshed.permissions ?? []).map((item) => item.key),
      allowedProcessIds: [...(refreshed.allowedProcessIds ?? [])],
    };
  }

  async createRole(input: CreateRoleDto) {
    const name = input.name.trim();
    const existing = await this.roleRepository.findOne({ where: { name } });
    if (existing) {
      throw new ConflictException(`A role named "${name}" already exists.`);
    }
    const perms = await this.permissionRepository.find({
      where: { key: In(input.permissionKeys) },
    });
    if (perms.length !== input.permissionKeys.length) {
      throw new BadRequestException('One or more permission keys are invalid.');
    }
    const saved = await this.roleRepository.save(
      this.roleRepository.create({
        name,
        fullAccess: input.fullAccess === true,
        enabled: input.enabled !== false,
        allowedProcessIds: [...(input.allowedProcessIds ?? [])],
        permissions: perms,
      }),
    );
    const refreshed = await this.roleRepository.findOne({
      where: { id: saved.id },
      relations: { permissions: true },
    });
    if (!refreshed) {
      throw new NotFoundException('Role not found.');
    }
    return {
      id: refreshed.id,
      name: refreshed.name,
      fullAccess: refreshed.fullAccess,
      enabled: refreshed.enabled,
      permissions: (refreshed.permissions ?? []).map((item) => item.key),
      allowedProcessIds: [...(refreshed.allowedProcessIds ?? [])],
    };
  }

  async deleteRole(id: string) {
    const role = await this.roleRepository.findOne({ where: { id } });
    if (!role) {
      throw new NotFoundException('Role not found.');
    }
    if (BUILTIN_ROLE_NAMES.has(role.name)) {
      throw new BadRequestException(
        `Built-in role "${role.name}" cannot be deleted.`,
      );
    }
    const assigned = await this.userRepository.count({ where: { roleId: id } });
    if (assigned > 0) {
      throw new BadRequestException(
        'Reassign all users before deleting this role.',
      );
    }
    await this.roleRepository.delete({ id });
    return { deleted: true as const };
  }

  /**
   * Limits departments/processes for users scoped by process function + optional role.process list.
   */
  async scopeDepartmentsForUser(
    departments: Department[],
    userEmail: string | null,
  ): Promise<Department[]> {
    if (!userEmail?.trim()) {
      return departments;
    }
    const ctx = await this.loadUserAccessContext(
      userEmail.trim().toLowerCase(),
    );
    if (!ctx) {
      return [];
    }
    if (ctx.effectivelyFullAccess) {
      return departments;
    }

    if (!ctx.departmentIds.length) {
      return [];
    }

    const result: Department[] = [];
    for (const d of departments) {
      if (!ctx.departmentIds.includes(d.id)) {
        continue;
      }
      let processes = [...(d.processes ?? [])];
      if (ctx.allowedProcessIds.length > 0) {
        processes = processes.filter((p) =>
          ctx.allowedProcessIds.includes(p.id),
        );
      }
      const clone = Object.assign(
        Object.create(Object.getPrototypeOf(d)),
        d,
      ) as Department;
      clone.processes = processes;
      result.push(clone);
    }
    return result;
  }

  async assertUserCanAccessProcess(
    userEmail: string,
    departmentId: string,
    processId: string,
  ): Promise<void> {
    const ctx = await this.loadUserAccessContext(
      userEmail.trim().toLowerCase(),
    );
    if (!ctx) {
      throw new ForbiddenException('Access denied.');
    }
    if (ctx.effectivelyFullAccess) {
      return;
    }
    if (!ctx.departmentIds.length) {
      throw new ForbiddenException(
        'No process function assignment for this account.',
      );
    }
    if (!ctx.departmentIds.includes(departmentId)) {
      throw new ForbiddenException(
        'You do not have access to this process function.',
      );
    }
    if (
      ctx.allowedProcessIds.length > 0 &&
      !ctx.allowedProcessIds.includes(processId)
    ) {
      throw new ForbiddenException('You do not have access to this process.');
    }
  }

  /** Ensures the user may act inside this process function (folder), without implying access to every process row. */
  async assertUserCanAccessDepartment(
    userEmail: string,
    departmentId: string,
  ): Promise<void> {
    const ctx = await this.loadUserAccessContext(
      userEmail.trim().toLowerCase(),
    );
    if (!ctx) {
      throw new ForbiddenException('Access denied.');
    }
    if (ctx.effectivelyFullAccess) {
      return;
    }
    if (!ctx.departmentIds.length) {
      throw new ForbiddenException(
        'No process function assignment for this account.',
      );
    }
    if (!ctx.departmentIds.includes(departmentId)) {
      throw new ForbiddenException(
        'You do not have access to this process function.',
      );
    }
  }

  /**
   * TypeORM `simple-array` may hydrate as `string[]` OR a comma-separated `string` depending on driver/version.
   * Treat both forms so department scope is never dropped silently.
   */
  private normalizeDepartmentIds(
    raw: string[] | string | undefined | null,
  ): string[] {
    if (raw === undefined || raw === null) {
      return [];
    }
    if (Array.isArray(raw)) {
      return raw
        .map(String)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    const s = String(raw).trim();
    if (!s) {
      return [];
    }
    return s
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
  }

  /**
   * Backend breadth for folders/process lists:
   * - `user.fullAccess` ⇒ unrestricted scope (same as before).
   * - Otherwise, if `departmentIds` is non-empty ⇒ **always scope** to those folders — even when the role is Admin with `role.fullAccess`.
   * - Empty `departmentIds` ⇒ inherit breadth from the role (`role.fullAccess` ⇒ see all departments).
   */
  private computeBreadthFullAccess(user: AccessUserEntity): boolean {
    if (user.fullAccess) {
      return true;
    }
    const deptIds = this.normalizeDepartmentIds(
      user.departmentIds as string[] | string | undefined,
    );
    if (deptIds.length > 0) {
      return false;
    }
    return !!user.role?.fullAccess;
  }

  private async loadUserAccessContext(email: string): Promise<{
    effectivelyFullAccess: boolean;
    departmentIds: string[];
    allowedProcessIds: string[];
  } | null> {
    const user = await this.findUserByEmail(normalizeEmail(email), {
      relations: { role: true },
    });
    if (!user || !user.enabled || !user.role?.enabled) {
      return null;
    }
    const effectivelyFullAccess = this.computeBreadthFullAccess(user);
    const departmentIds = this.normalizeDepartmentIds(
      user.departmentIds as string[] | string | undefined,
    );
    return {
      effectivelyFullAccess,
      departmentIds,
      allowedProcessIds: user.role.allowedProcessIds ?? [],
    };
  }

  /** Lowercase email → display name (audit log labels). */
  async getUserEmailDisplayMap(): Promise<Map<string, string>> {
    const users = await this.userRepository.find({
      select: ['email', 'displayName'],
    });
    const map = new Map<string, string>();
    for (const user of users) {
      const email = normalizeEmail(user.email);
      const name = user.displayName?.trim();
      map.set(email, name || email);
    }
    return map;
  }

  async getUsers(requesterEmail: string) {
    const users = await this.userRepository.find({
      order: { displayName: 'ASC' },
      relations: { role: true },
    });
    const requester = await this.findUserByEmail(requesterEmail, {
      relations: { role: true },
    });
    if (!requester) {
      return [];
    }

    const mapRow = (user: AccessUserEntity) => ({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      roleId: user.roleId,
      roleName: user.role?.name ?? '',
      /** User-row flag only — UI must combine with `roleFullAccess` for effective scope. */
      fullAccess: user.fullAccess,
      roleFullAccess: !!user.role?.fullAccess,
      departmentIds: this.normalizeDepartmentIds(
        user.departmentIds as string[] | string | undefined,
      ),
      enabled: user.enabled !== false,
    });

    if (requester.fullAccess || requester.role?.fullAccess) {
      return users.map(mapRow);
    }

    const reqDepts = requester.departmentIds ?? [];
    if (!reqDepts.length) {
      return users.filter((u) => u.id === requester.id).map(mapRow);
    }

    return users
      .filter((u) => {
        if (u.id === requester.id) {
          return true;
        }
        const uDepts = u.departmentIds ?? [];
        return uDepts.some((id) => reqDepts.includes(id));
      })
      .map(mapRow);
  }

  async createUser(input: UpsertUserDto, requesterEmail: string) {
    if (!input.password?.trim()) {
      throw new BadRequestException(
        'Password is required when creating a user.',
      );
    }
    await this.assertRequesterMayManageUser(requesterEmail, null, input);
    return this.upsertUser(null, input);
  }

  async updateUser(id: string, input: UpsertUserDto, requesterEmail: string) {
    await this.assertRequesterMayManageUser(requesterEmail, id, input);
    return this.upsertUser(id, input);
  }

  private async assertRequesterMayManageUser(
    requesterEmail: string,
    userIdBeingEdited: string | null,
    input: UpsertUserDto,
  ): Promise<void> {
    const requester = await this.findUserByEmail(requesterEmail, {
      relations: { role: true },
    });
    if (!requester) {
      throw new ForbiddenException('Access denied.');
    }
    if (requester.fullAccess || requester.role?.fullAccess) {
      return;
    }

    const adminNorm = normalizeEmail(administratorEmail());
    const inputEmail = normalizeEmail(input.email);
    const target =
      userIdBeingEdited !== null
        ? await this.userRepository.findOne({
            where: { id: userIdBeingEdited },
          })
        : await this.findUserByEmail(inputEmail);

    if (inputEmail === adminNorm || normalizeEmail(target?.email) === adminNorm) {
      throw new ForbiddenException(
        'Only a full-access administrator can change the primary administrator account.',
      );
    }

    if (input.fullAccess) {
      throw new ForbiddenException('You cannot grant full access.');
    }

    const newRole = await this.roleRepository.findOne({
      where: { id: input.roleId },
    });
    if (!newRole) {
      throw new NotFoundException('Role not found.');
    }
    if (newRole.fullAccess) {
      throw new ForbiddenException('You cannot assign a full-access role.');
    }

    const reqDepts = requester.departmentIds ?? [];
    if (!reqDepts.length) {
      throw new ForbiddenException(
        'Your account has no process function scope; you cannot manage users.',
      );
    }

    const effectiveDepts =
      input.departmentIds !== undefined
        ? [...(input.departmentIds ?? [])]
        : [...(target?.departmentIds ?? [])];

    if (!effectiveDepts.length) {
      throw new BadRequestException(
        'Assign at least one process function for this user.',
      );
    }

    for (const deptId of effectiveDepts) {
      if (!reqDepts.includes(deptId)) {
        throw new ForbiddenException(
          'You can only assign process functions that you belong to.',
        );
      }
    }
  }

  private async ensureSeeds() {
    const existingPermissions = await this.permissionRepository.find({
      where: { key: In(ALL_PERMISSION_KEYS) },
    });
    const existingPermissionMap = new Map(
      existingPermissions.map((item) => [item.key, item]),
    );

    for (const key of ALL_PERMISSION_KEYS) {
      if (!existingPermissionMap.has(key)) {
        const created = await this.permissionRepository.save(
          this.permissionRepository.create({
            key,
            label: key,
          }),
        );
        existingPermissionMap.set(key, created);
      }
    }

    const allPermissions = Array.from(existingPermissionMap.values());
    /**
     * Department Manager: every module enabled. We keep `fullAccess=false` so
     * admins can still toggle individual permissions later from the Roles UI.
     */
    const managerPermissions = allPermissions;
    /**
     * Viewer: browse the BPM tree only (no user/role admin, no template master,
     * no vendor uploads). Kept narrow so the Viewer role stays meaningfully
     * different from Department Manager.
     */
    const viewerPermissionKeys: PermissionKey[] = [
      PERMISSIONS.departments,
      PERMISSIONS.processes,
      PERMISSIONS.activities,
    ];
    const viewerPermissions = allPermissions.filter((item) =>
      viewerPermissionKeys.includes(item.key as PermissionKey),
    );

    /**
     * Vendor role: limited read on folders + processes (so they can navigate),
     * and a dedicated `vendorVersions` permission to upload / inline-edit their
     * own overlay. They cannot edit the Original Sub-process fields (no `activities`).
     */
    const vendorPermissionKeys: PermissionKey[] = [
      PERMISSIONS.departments,
      PERMISSIONS.processes,
      PERMISSIONS.vendorVersions,
    ];
    const vendorPermissions = allPermissions.filter((item) =>
      vendorPermissionKeys.includes(item.key as PermissionKey),
    );

    const superAdminRole = await this.ensureRole(
      'Super Admin',
      true,
      allPermissions,
    );
    await this.ensureRole('Admin', true, allPermissions);
    const managerRole = await this.ensureRole(
      'Department Manager',
      false,
      managerPermissions,
    );
    const viewerRole = await this.ensureRole(
      'Viewer',
      false,
      viewerPermissions,
    );
    await this.ensureRole('Vendor', false, vendorPermissions);

    await this.seedNewEastDepartments();
    await this.syncNewEastUserRoster(superAdminRole, managerRole, viewerRole);
  }

  /** Cryptographically random password (used only when none is configured). */
  private generateRandomPassword(): string {
    return randomBytes(18).toString('base64url');
  }

  /**
   * Ensures the administrator account exists (Super Admin).
   * Set `ADMIN_INITIAL_PASSWORD` to choose its first password; otherwise a random one is
   * generated and printed once in the server log. Existing users are never modified.
   */
  private async syncNewEastUserRoster(
    superAdminRole: RoleEntity,
    managerRole: RoleEntity,
    viewerRole: RoleEntity,
  ): Promise<void> {
    const adminEmail = normalizeEmail(administratorEmail());
    let adminUser = await this.findUserByEmail(adminEmail);
    let adminPlain = process.env.ADMIN_INITIAL_PASSWORD?.trim() || '';
    if ((!adminUser || !adminUser.passwordHash) && !adminPlain) {
      adminPlain = this.generateRandomPassword();
      Logger.warn(
        `No ADMIN_INITIAL_PASSWORD set. Generated one-time password for ${adminEmail}: ${adminPlain} (change it after first sign-in).`,
        'AccessControl',
      );
    }
    const adminHash = adminPlain ? await bcrypt.hash(adminPlain, 10) : '';
    if (!adminUser) {
      adminUser = this.userRepository.create({
        email: adminEmail,
        displayName: 'admin',
        roleId: superAdminRole.id,
        fullAccess: true,
        departmentIds: [],
        enabled: true,
        passwordHash: adminHash,
      });
      await this.userRepository.save(adminUser);
    } else if (!adminUser.passwordHash && adminHash) {
      adminUser.passwordHash = adminHash;
      await this.userRepository.save(adminUser);
    }
  }

  /**
   * Recreates default New East process-function folders (010–014) after operational purge.
   * Does not create or link users.
   */
  async reseedNewEastOrganization(): Promise<void> {
    await this.seedNewEastDepartments();
  }

  /** New East demo folders (FZCO + department codes) — no automatic users. */
  private async seedNewEastDepartments() {
    const companyCode = 'FZCO' as CompanyCode;

    const orgUnits: { code: string; name: string }[] = [
      { code: '010-000-000', name: 'Business & IT' },
      { code: '011-000-000', name: 'Operation' },
      { code: '012-000-000', name: 'Audit' },
      { code: '013-000-000', name: 'Finance' },
      { code: '014-000-000', name: 'Planning and Procurement' },
    ];

    for (const unit of orgUnits) {
      const existing = await this.departmentRepository.findOne({
        where: { code: unit.code },
      });
      if (!existing) {
        await this.departmentRepository.save(
          this.departmentRepository.create({
            code: unit.code,
            name: unit.name,
            companyCode,
          }),
        );
      }
    }
  }

  /**
   * Ensures a built-in role exists. On first create applies defaults; on later startups
   * only adds newly introduced permission keys — never overwrites admin UI changes.
   */
  private async ensureRole(
    name: string,
    fullAccess: boolean,
    defaultPermissions: PermissionEntity[],
  ): Promise<RoleEntity> {
    const existing = await this.roleRepository.findOne({
      where: { name },
      relations: { permissions: true },
    });
    if (!existing) {
      return this.roleRepository.save(
        this.roleRepository.create({
          name,
          fullAccess,
          enabled: true,
          allowedProcessIds: [],
          permissions: defaultPermissions,
        }),
      );
    }

    const existingKeys = new Set(
      (existing.permissions ?? []).map((item) => item.key),
    );
    const missing = defaultPermissions.filter(
      (item) => !existingKeys.has(item.key),
    );
    if (missing.length > 0) {
      existing.permissions = [...(existing.permissions ?? []), ...missing];
      await this.roleRepository.save(existing);
    }

    return existing;
  }

  private async upsertUser(userId: string | null, input: UpsertUserDto) {
    const role = await this.roleRepository.findOne({
      where: { id: input.roleId },
    });
    if (!role) {
      throw new NotFoundException('Role not found.');
    }
    if (!role.enabled) {
      throw new BadRequestException(
        'This role is disabled. Enable it under Roles before assigning it to a user.',
      );
    }

    const normalizedEmail = normalizeEmail(input.email);
    const normalizedName = input.displayName.trim();
    const fullAccess = !!input.fullAccess;
    const enabled = input.enabled !== false;
    const password = input.password?.trim();

    let user = userId
      ? await this.userRepository.findOne({ where: { id: userId } })
      : await this.findUserByEmail(normalizedEmail);

    const duplicate = await this.findUserByEmail(normalizedEmail);
    if (duplicate && duplicate.id !== user?.id) {
      throw new ConflictException('A user with this email already exists.');
    }

    const departmentIds =
      input.departmentIds !== undefined
        ? [...(input.departmentIds ?? [])]
        : [...(user?.departmentIds ?? [])];

    if (departmentIds.length) {
      const departments = await this.departmentRepository.find({
        where: { id: In(departmentIds) },
      });
      if (departments.length !== departmentIds.length) {
        throw new BadRequestException('One or more departments are invalid.');
      }
    }

    if (!user) {
      if (!password || password.length < 6) {
        throw new BadRequestException(
          'A password of at least 6 characters is required for new users.',
        );
      }
      const passwordHash = await bcrypt.hash(password, 10);
      user = this.userRepository.create({
        email: normalizedEmail,
        displayName: normalizedName,
        roleId: role.id,
        fullAccess,
        departmentIds,
        enabled,
        passwordHash,
      });
    } else {
      user.email = normalizedEmail;
      user.displayName = normalizedName;
      user.roleId = role.id;
      user.fullAccess = fullAccess;
      user.departmentIds = departmentIds;
      user.enabled = enabled;
      if (password) {
        user.passwordHash = await bcrypt.hash(password, 10);
      }
    }

    const saved = await this.userRepository.save(user);
    return {
      id: saved.id,
      email: saved.email,
      displayName: saved.displayName,
      roleId: saved.roleId,
      roleName: role.name,
      fullAccess: saved.fullAccess,
      roleFullAccess: !!role.fullAccess,
      departmentIds: this.normalizeDepartmentIds(
        saved.departmentIds as string[] | string | undefined,
      ),
      enabled: saved.enabled !== false,
    };
  }
}
