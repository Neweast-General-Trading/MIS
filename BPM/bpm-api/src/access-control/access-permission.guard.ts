import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';

import { AccessControlService } from './access-control.service';
import { resolveRequestUserEmail } from 'src/common/auth/request-user-email.util';
import { REQUIRED_PERMISSION_KEY } from './permissions.decorator';
import { REQUIRE_SUPER_ADMIN_KEY } from './super-admin.decorator';
import { REQUIRE_AI_ACCESS_KEY } from './ai-access.decorator';
import { type PermissionKey } from './access-control.constants';

@Injectable()
export class AccessPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accessControlService: AccessControlService,
    private readonly jwtService: JwtService
  ) {}

  async canActivate(context: ExecutionContext) {
    const requireSuperAdmin = this.reflector.getAllAndOverride<boolean>(
      REQUIRE_SUPER_ADMIN_KEY,
      [context.getHandler(), context.getClass()],
    );

    const requireAiAccess = this.reflector.getAllAndOverride<boolean>(
      REQUIRE_AI_ACCESS_KEY,
      [context.getHandler(), context.getClass()],
    );

    const meta = this.reflector.getAllAndOverride<PermissionKey | PermissionKey[]>(
      REQUIRED_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (requireSuperAdmin) {
      const request = context
        .switchToHttp()
        .getRequest<{ headers: Record<string, string | undefined> }>();
      const email = resolveRequestUserEmail(request, this.jwtService);
      const allowed = await this.accessControlService.userIsSuperAdmin(email);
      if (!allowed) {
        throw new ForbiddenException('Only Super Admin can access this resource.');
      }
      return true;
    }

    if (requireAiAccess) {
      const request = context
        .switchToHttp()
        .getRequest<{ headers: Record<string, string | undefined> }>();
      const email = resolveRequestUserEmail(request, this.jwtService);
      const allowed = await this.accessControlService.userCanUseAi(email);
      if (!allowed) {
        throw new ForbiddenException(
          'AI Word export is available only to Super Admin and approved users.',
        );
      }
      return true;
    }

    if (!meta) return true;
    const permissions = Array.isArray(meta) ? meta : [meta];
    if (permissions.length === 0) return true;

    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined> }>();
    const userEmail = resolveRequestUserEmail(request, this.jwtService);

    let allowed = false;
    for (const permission of permissions) {
      // eslint-disable-next-line no-await-in-loop
      if (await this.accessControlService.userHasPermission(userEmail, permission)) {
        allowed = true;
        break;
      }
    }
    if (!allowed) {
      throw new ForbiddenException('You do not have permission to perform this action.');
    }
    return true;
  }
}
