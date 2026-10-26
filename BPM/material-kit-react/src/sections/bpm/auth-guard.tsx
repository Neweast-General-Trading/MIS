import { Navigate } from 'react-router';
import { useState, useEffect } from 'react';

import { ACCESS_PROFILE_EVENT, ACCESS_TOKEN_STORAGE_KEY } from './access-control';

type AuthGuardProps = {
  children: React.ReactNode;
};

export function AuthGuard({ children }: AuthGuardProps) {
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    const read = () => {
      const token = localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
      setAuthenticated(Boolean(token?.trim()));
      setReady(true);
    };
    read();
    window.addEventListener(ACCESS_PROFILE_EVENT, read);
    window.addEventListener('storage', read);
    return () => {
      window.removeEventListener(ACCESS_PROFILE_EVENT, read);
      window.removeEventListener('storage', read);
    };
  }, []);

  if (!ready) {
    return null;
  }

  if (!authenticated) {
    return <Navigate to="/sign-in" replace />;
  }

  return <>{children}</>;
}
