import { SetMetadata } from '@nestjs/common';
import { type PermissionKey } from './access-control.constants';

export const REQUIRED_PERMISSION_KEY = 'required_permission_key';

/**
 * Pass a single key (single requirement) or a list (any-of: user needs at
 * least one of the listed permissions).
 */
export const RequirePermission = (...permissions: PermissionKey[]) =>
  SetMetadata(REQUIRED_PERMISSION_KEY, permissions);
