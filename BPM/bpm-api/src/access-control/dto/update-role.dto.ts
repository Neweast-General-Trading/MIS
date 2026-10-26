import { IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

import { ALL_PERMISSION_KEYS, type PermissionKey } from '../access-control.constants';

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsIn(ALL_PERMISSION_KEYS, { each: true })
  permissionKeys?: PermissionKey[];

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  allowedProcessIds?: string[];
}
