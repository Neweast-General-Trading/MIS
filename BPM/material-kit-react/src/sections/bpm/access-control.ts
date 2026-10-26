import { useState, useEffect } from 'react';

export const ACCESS_PROFILE_EVENT = 'bpm-access-profile-updated';
const ACCESS_PROFILE_STORAGE_KEY = 'bpm-access-profile';
export const ACCESS_TOKEN_STORAGE_KEY = 'bpm-access-token';

export type PermissionKey =
  | 'departments'
  | 'processes'
  | 'activities'
  | 'usersPermissions'
  | 'usersRoles'
  | 'activitiesTemplateMaster'
  | 'applicationMaster'
  | 'vendorVersions'
  | 'processDocumentation'
  | 'aiBpmGenerate';

export type AccessProfile = {
  roleName: string;
  fullAccess: boolean;
  permissions: Record<PermissionKey, boolean>;
  /** Set after sign-in with email/password */
  email?: string;
  displayName?: string;
  /** Process function folder IDs from the server (used for client-side hints). */
  departmentIds?: string[];
  /** Super Admin or on the server's AI allow-list. */
  canUseAi?: boolean;
};

/** UI preview / role templates only — not used when no session is stored. */
export const DEFAULT_ACCESS_PROFILE: AccessProfile = {
  roleName: 'Super Admin',
  fullAccess: true,
  permissions: {
    departments: true,
    processes: true,
    activities: true,
    usersPermissions: true,
    usersRoles: true,
    activitiesTemplateMaster: true,
    applicationMaster: true,
    vendorVersions: true,
    processDocumentation: true,
    aiBpmGenerate: true,
  },
};

export const GUEST_ACCESS_PROFILE: AccessProfile = {
  roleName: 'Guest',
  fullAccess: false,
  permissions: {
    departments: false,
    processes: false,
    activities: false,
    usersPermissions: false,
    usersRoles: false,
    activitiesTemplateMaster: false,
    applicationMaster: false,
    vendorVersions: false,
    processDocumentation: false,
    aiBpmGenerate: false,
  },
};

export function loadAccessProfile(): AccessProfile {
  if (typeof window === 'undefined') return GUEST_ACCESS_PROFILE;
  const raw = window.localStorage.getItem(ACCESS_PROFILE_STORAGE_KEY);
  if (!raw) return GUEST_ACCESS_PROFILE;

  try {
    const parsed = JSON.parse(raw) as Partial<AccessProfile>;
    const parsedProfile: AccessProfile = {
      roleName: parsed.roleName ?? GUEST_ACCESS_PROFILE.roleName,
      fullAccess: parsed.fullAccess ?? GUEST_ACCESS_PROFILE.fullAccess,
      permissions: {
        ...GUEST_ACCESS_PROFILE.permissions,
        ...(parsed.permissions ?? {}),
      },
      email: parsed.email,
      displayName: parsed.displayName,
      departmentIds: parsed.departmentIds,
      canUseAi: parsed.canUseAi,
    };
    return parsedProfile;
  } catch {
    return GUEST_ACCESS_PROFILE;
  }
}

export function saveAccessProfile(profile: AccessProfile) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ACCESS_PROFILE_STORAGE_KEY, JSON.stringify(profile));
  window.dispatchEvent(new Event(ACCESS_PROFILE_EVENT));
}

export function saveAuthSession(accessToken: string, profile: AccessProfile) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, accessToken);
  saveAccessProfile(profile);
}

export function clearAuthSession() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(ACCESS_PROFILE_STORAGE_KEY);
  window.dispatchEvent(new Event(ACCESS_PROFILE_EVENT));
}

export function hasPermission(profile: AccessProfile, permission: PermissionKey) {
  return profile.fullAccess || !!profile.permissions[permission];
}

/** Matches the reserved role name used in roles management (cannot be renamed). */
export function isSuperAdminProfile(profile: AccessProfile): boolean {
  return profile.roleName === 'Super Admin';
}

/** AI Word export: Super Admin or a user approved on the server. */
export function canUseAiExport(profile: AccessProfile): boolean {
  return isSuperAdminProfile(profile) || profile.canUseAi === true;
}

/** Manage company master data (Oracle legal entity, add company). */
export function canManageCompanies(profile: AccessProfile): boolean {
  return (
    profile.fullAccess ||
    isSuperAdminProfile(profile) ||
    hasPermission(profile, 'usersPermissions')
  );
}

export function useAccessProfile() {
  const [profile, setProfile] = useState<AccessProfile>(loadAccessProfile());

  useEffect(() => {
    const updateProfile = () => setProfile(loadAccessProfile());
    window.addEventListener(ACCESS_PROFILE_EVENT, updateProfile);
    window.addEventListener('storage', updateProfile);
    return () => {
      window.removeEventListener(ACCESS_PROFILE_EVENT, updateProfile);
      window.removeEventListener('storage', updateProfile);
    };
  }, []);

  return profile;
}

/**
 * Refresh the cached profile against the server so newly granted permissions
 * (added to the role after the user signed in) take effect without forcing
 * a logout. No-op when there is no stored token.
 */
export async function refreshAccessProfileFromServer(apiBaseUrl: string): Promise<void> {
  if (typeof window === 'undefined') return;
  const token = window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
  if (!token?.trim()) return;
  try {
    const response = await fetch(`${apiBaseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status === 401 || response.status === 403) {
      clearAuthSession();
      return;
    }
    if (!response.ok) {
      return;
    }
    const fresh = (await response.json()) as Partial<AccessProfile> & {
      email?: string;
      displayName?: string;
    };
    const merged: AccessProfile = {
      roleName: fresh.roleName ?? GUEST_ACCESS_PROFILE.roleName,
      fullAccess: fresh.fullAccess ?? GUEST_ACCESS_PROFILE.fullAccess,
      permissions: {
        ...GUEST_ACCESS_PROFILE.permissions,
        ...(fresh.permissions ?? {}),
      },
      email: fresh.email,
      displayName: fresh.displayName,
      departmentIds: fresh.departmentIds,
      canUseAi: fresh.canUseAi,
    };
    saveAccessProfile(merged);
  } catch {
    /* network errors leave the cached profile in place */
  }
}
