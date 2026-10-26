import type { ActivityComment } from './storage';
import type { AccessProfile } from './access-control';

/** Matches server-side author label (display name or email fallback). */
export function commentAuthorMatchesProfile(comment: ActivityComment, profile: AccessProfile): boolean {
  const a = comment.author.trim().toLowerCase();
  const dn = profile.displayName?.trim().toLowerCase();
  const em = profile.email?.trim().toLowerCase();
  if (dn && a === dn) return true;
  if (em && a === em) return true;
  return false;
}
