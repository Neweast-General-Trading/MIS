import { Navigate } from 'react-router-dom';

import { useAccessProfile, isSuperAdminProfile } from './access-control';

type SuperAdminGuardProps = {
  children: React.ReactNode;
};

export function SuperAdminGuard({ children }: SuperAdminGuardProps) {
  const profile = useAccessProfile();

  if (!isSuperAdminProfile(profile)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
