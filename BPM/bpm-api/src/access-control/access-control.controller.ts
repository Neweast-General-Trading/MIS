import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

import { PERMISSIONS } from './access-control.constants';
import { RequirePermission } from './permissions.decorator';
import { AccessControlService } from './access-control.service';
import { resolveRequestUserEmail } from 'src/common/auth/request-user-email.util';
import { UpsertUserDto } from './dto/upsert-user.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Controller('access-control')
export class AccessControlController {
  constructor(
    private readonly accessControlService: AccessControlService,
    private readonly jwtService: JwtService,
  ) {}

  private resolveRequestingUserEmail(req: Request): string {
    return resolveRequestUserEmail(req, this.jwtService);
  }

  @Get('roles')
  @RequirePermission(PERMISSIONS.usersRoles)
  getRoles() {
    return this.accessControlService.getRoles();
  }

  @Post('roles')
  @RequirePermission(PERMISSIONS.usersRoles)
  createRole(@Body() dto: CreateRoleDto) {
    return this.accessControlService.createRole(dto);
  }

  @Patch('roles/:id')
  @RequirePermission(PERMISSIONS.usersRoles)
  updateRole(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.accessControlService.updateRole(id, dto);
  }

  @Delete('roles/:id')
  @RequirePermission(PERMISSIONS.usersRoles)
  deleteRole(@Param('id') id: string) {
    return this.accessControlService.deleteRole(id);
  }

  @Get('users')
  @RequirePermission(PERMISSIONS.usersPermissions)
  getUsers(@Req() req: Request) {
    return this.accessControlService.getUsers(this.resolveRequestingUserEmail(req));
  }

  @Post('users')
  @RequirePermission(PERMISSIONS.usersPermissions)
  createUser(@Req() req: Request, @Body() dto: UpsertUserDto) {
    return this.accessControlService.createUser(dto, this.resolveRequestingUserEmail(req));
  }

  @Patch('users/:id')
  @RequirePermission(PERMISSIONS.usersPermissions)
  updateUser(@Req() req: Request, @Param('id') id: string, @Body() dto: UpsertUserDto) {
    return this.accessControlService.updateUser(id, dto, this.resolveRequestingUserEmail(req));
  }
}
