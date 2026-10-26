export const PERMISSIONS = {
  departments: 'departments',
  processes: 'processes',
  activities: 'activities',
  usersPermissions: 'usersPermissions',
  usersRoles: 'usersRoles',
  activitiesTemplateMaster: 'activitiesTemplateMaster',
  /** Administration → Application Master: the applications used in the company. */
  applicationMaster: 'applicationMaster',
  /**
   * Allows uploading and editing a per-user "vendor" overlay on Sub-process values.
   * The overlay is stored next to the Original answers and never overwrites them.
   */
  vendorVersions: 'vendorVersions',
  /**
   * View, upload, and download files attached to a Process Function or Process.
   */
  processDocumentation: 'processDocumentation',
  /**
   * Generate BPM documents via Automation using stored prompt templates + optional custom text.
   */
  aiBpmGenerate: 'aiBpmGenerate',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSION_KEYS: PermissionKey[] = Object.values(PERMISSIONS);

/**
 * Users (besides Super Admin) who may use the AI Word export / generate features.
 * Configure with `AI_EXPORT_ALLOWED_EMAILS` (comma-separated, case-insensitive).
 * Empty = Super Admin only.
 */
export function aiExportAllowedEmails(): ReadonlySet<string> {
  return new Set(
    (process.env.AI_EXPORT_ALLOWED_EMAILS ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}
