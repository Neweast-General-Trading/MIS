import { Navigate } from 'react-router-dom';

import {
  hasPermission,
  useAccessProfile,
  type PermissionKey,
  ACCESS_TOKEN_STORAGE_KEY,
} from './access-control';

type PermissionGuardProps = {
  /** Single key or list of keys; the user needs at least one of them. */
  permission: PermissionKey | PermissionKey[];
  children: React.ReactNode;
};

export function PermissionGuard({ permission, children }: PermissionGuardProps) {
  const profile = useAccessProfile();
  const token =
    typeof window !== 'undefined' ? window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY) : null;

  if (!token?.trim()) {
    return <Navigate to="/sign-in" replace />;
  }

  const requirements = Array.isArray(permission) ? permission : [permission];
  const allowed = requirements.some((key) => hasPermission(profile, key));
  if (!allowed) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
