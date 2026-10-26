import type { AccessUser } from 'src/sections/bpm/api';

/** Map stored owner string (email or legacy display name) to canonical **email** when it matches a user. */
export function normalizeOwnerToEmail(token: string, users: AccessUser[]): string {
  const t = String(token ?? '').trim();
  if (!t) return '';
  const lower = t.toLowerCase();
  const byEmail = users.find((u) => u.email.toLowerCase() === lower);
  if (byEmail) return byEmail.email;
  const byName = users.find((u) => u.displayName.trim().toLowerCase() === lower);
  if (byName) return byName.email;
  return t;
}

/** Normalizes each entry to email when possible; drops empties. */
export function mapStoredOwnersToEmails(stored: string[] | undefined, users: AccessUser[]): string[] {
  if (!stored?.length) return [];
  return stored.map((s) => normalizeOwnerToEmail(s, users)).filter(Boolean);
}

/** Keep only emails that exist in the access user list (strict pick-list). */
export function filterOwnersToKnownUsers(emails: string[], users: AccessUser[]): string[] {
  const allowed = new Set(users.map((u) => u.email.toLowerCase()));
  return emails.filter((e) => allowed.has(e.trim().toLowerCase()));
}
