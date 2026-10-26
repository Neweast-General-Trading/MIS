import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';

import {
  aiExportAllowedEmails,
  ALL_PERMISSION_KEYS,
  type PermissionKey,
} from 'src/access-control/access-control.constants';
import { AccessUserEntity } from 'src/access-control/entities/user.entity';
import {
  findAccessUserByEmail,
  normalizeEmail,
} from 'src/common/auth/access-user-email.util';

export type LoginUserPayload = {
  id: string;
  email: string;
  displayName: string;
  roleName: string;
  fullAccess: boolean;
  departmentIds: string[];
  permissions: Record<PermissionKey, boolean>;
  /** Super Admin or on the AI allow-list: may use AI Word export. */
  canUseAi: boolean;
};

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(AccessUserEntity)
    private readonly userRepository: Repository<AccessUserEntity>,
    private readonly jwtService: JwtService
  ) {}

  private buildPermissions(user: AccessUserEntity): Record<PermissionKey, boolean> {
    const base = Object.fromEntries(ALL_PERMISSION_KEYS.map((k) => [k, false])) as Record<PermissionKey, boolean>;
    if (user.fullAccess || user.role.fullAccess) {
      ALL_PERMISSION_KEYS.forEach((k) => {
        base[k] = true;
      });
      return base;
    }
    (user.role.permissions ?? []).forEach((p) => {
      if (ALL_PERMISSION_KEYS.includes(p.key as PermissionKey)) {
        base[p.key as PermissionKey] = true;
      }
    });
    return base;
  }

  private async findActiveUserByEmail(email: string) {
    return findAccessUserByEmail(this.userRepository, email, {
      relations: { role: true, permissions: true },
    });
  }

  private assertUserCanSignIn(user: AccessUserEntity | null) {
    if (!user) {
      throw new UnauthorizedException('You do not have access to this module.');
    }
    if (user.enabled === false) {
      throw new UnauthorizedException(
        'This account is disabled. Contact an administrator to reactivate it.',
      );
    }
    if (!user.role?.enabled) {
      throw new UnauthorizedException(
        'This role is disabled. Contact an administrator to enable it under Roles.',
      );
    }
    return user;
  }

  private canUseAi(user: AccessUserEntity): boolean {
    return (
      user.role?.name === 'Super Admin' ||
      aiExportAllowedEmails().has(normalizeEmail(user.email))
    );
  }

  private async issueLoginResponse(user: AccessUserEntity) {
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: normalizeEmail(user.email),
    });

    const permissions = this.buildPermissions(user);
    const payload: LoginUserPayload = {
      id: user.id,
      email: normalizeEmail(user.email),
      displayName: user.displayName,
      roleName: user.role.name,
      fullAccess: user.fullAccess || user.role.fullAccess,
      departmentIds: user.departmentIds ?? [],
      permissions,
      canUseAi: this.canUseAi(user),
    };

    return { accessToken, user: payload };
  }

  async login(email: string, password: string) {
    const normalizedEmail = normalizeEmail(email);
    const user = await this.findActiveUserByEmail(normalizedEmail);
    if (!user?.passwordHash) {
      throw new UnauthorizedException('Invalid email or password.');
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid email or password.');
    }
    this.assertUserCanSignIn(user);
    return this.issueLoginResponse(user);
  }

  async loginWithMicrosoftEmail(email: string) {
    const normalizedEmail = normalizeEmail(email);
    const user = this.assertUserCanSignIn(await this.findActiveUserByEmail(normalizedEmail));
    return this.issueLoginResponse(user);
  }

  async profileByEmail(email: string): Promise<LoginUserPayload> {
    const normalizedEmail = normalizeEmail(email);
    const user = this.assertUserCanSignIn(await this.findActiveUserByEmail(normalizedEmail));
    return {
      id: user.id,
      email: normalizeEmail(user.email),
      displayName: user.displayName,
      roleName: user.role.name,
      fullAccess: user.fullAccess || user.role.fullAccess,
      departmentIds: user.departmentIds ?? [],
      permissions: this.buildPermissions(user),
      canUseAi: this.canUseAi(user),
    };
  }
}
