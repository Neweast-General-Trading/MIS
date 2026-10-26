export type BpmProcess = {
  id: string;
  code: string;
  name: string;
  processName: string;
  companyCode: string;
  projectName?: string | null;
  description?: string | null;
  processOwners?: string[];
  processDescription?: string | null;
  activityTemplateId?: string | null;
  activityTemplateName?: string | null;
  createdAt: string;
  activities?: ActivityItem[];
};

export type DepartmentFolder = {
  id: string;
  name: string;
  code: string;
  companyCode: string;
  orgDepartmentId?: string | null;
  orgDepartmentName?: string | null;
  hanaBranch?: string | null;
  hanaDeptCode?: number | null;
  hanaDepartmentName?: string | null;
  /** Process code format for this process function: 3 => C1-C2-000, 4 => C1-C2-C3-000. */
  processCodeLevels?: 3 | 4;
  /** Default owners for this process function; saving the folder applies them to all processes and sub-processes. */
  processFunctionOwners?: string[];
  createdAt: string;
  processes: BpmProcess[];
};

export type ActivityVendorVersion = {
  /** Friendly label shown in the green vendor row. */
  vendorName: string;
  /** Lowercased email of the user who owns this overlay; also the storage key. */
  submittedBy: string;
  updatedAt: string;
  activityName?: string | null;
  activityDescription?: string | null;
  details: Record<string, string | string[]>;
};

export type RelatedSubProcessLink = {
  id: string;
  code: string;
  activityName: string;
  activityDescription?: string | null;
  status?: string;
  owners?: string[];
  processId: string;
  processCode: string;
  processName: string;
  departmentId: string;
  departmentCode: string;
  departmentName: string;
  details?: Record<string, string | string[]>;
};

export type RelatedPolicyLink = {
  id: string;
  policyCreatorPolicyId: string;
  policyName: string;
  policyVersion?: number | null;
  companyCode?: string | null;
  companyName?: string | null;
  departmentName?: string | null;
  processCode?: string | null;
  processName?: string | null;
  activityCode?: string | null;
  policyCreatorUrl?: string | null;
  linkedBy?: string | null;
  linkedAt?: string;
};

export type ActivityItem = {
  id: string;
  processId: string;
  /** Parent sub-process when this row is a nested "sub sub-process". */
  parentActivityId?: string | null;
  sln: number;
  code: string;
  activityName: string;
  templateId?: string | null;
  templateName?: string | null;
  details?: Record<string, string | string[]>;
  fieldDiscussion?: Record<string, boolean>;
  activityDescription?: string | null;
  owners?: string[];
  status?: string;
  discussionEnabled?: boolean;
  comments?: ActivityComment[];
  /** Cross-process links — shown in Relative Sub-Process column (bidirectional). */
  relatedSubProcesses?: RelatedSubProcessLink[];
  /** Policy Creator policies linked to this sub-process. */
  relatedPolicies?: RelatedPolicyLink[];
  /**
   * Per-vendor overlays keyed by lowercased email of the uploading user. Original values are
   * never overwritten — the overlay carries a parallel copy of name / description / details
   * so the UI can render Original (red) and Vendor (green) side-by-side.
   */
  vendorVersions?: Record<string, ActivityVendorVersion>;
  createdAt: string;
};

export type ActivityTemplateField = {
  key: string;
  label: string;
  type:
    | 'text'
    | 'textarea'
    | 'yes_no'
    | 'dropdown_job_title'
    | 'dropdown_person_name'
    | 'dropdown_multiselect'
    | 'dropdown'
    | 'person_multi'
    | 'boolean'
    | 'job_title'
    | 'number'
    | 'numeric_days'
    | 'oracle_job_role_multi'
    | 'app_master'
    | 'approval_flow';
  openToDiscussion?: boolean;
  options?: string[];
};

export type ActivityTemplate = {
  id: string;
  name: string;
  description?: string | null;
  fields: ActivityTemplateField[];
  createdAt: string;
};

export type ActivityComment = {
  id: string;
  activityId: string;
  author: string;
  message: string;
  attachmentOriginalName?: string | null;
  attachmentMimeType?: string | null;
  attachmentStoredPath?: string | null;
  attachments?: Array<{
    id: string;
    originalName: string;
    mimeType?: string | null;
    storedPath: string;
    storedFileName: string;
    subProcessCode: string;
    createdAt: string;
  }>;
  createdAt: string;
};

export const DEPARTMENT_CODE_PATTERN = /^\d{3}-\d{3}-\d{3}$/;

/**
 * Short explorer / list label: `001-000-000` + `Planning & Procurement` → `1- Planning & Procurement`.
 * Spaces kept; Title Case; no kebab-case.
 */
export function toDepartmentDisplayName(code: string, name: string) {
  const major = String(code ?? '')
    .trim()
    .split('-')[0] ?? '';
  const n = Number.parseInt(major, 10);
  const shortNum = Number.isFinite(n) ? String(n) : major.replace(/^0+/, '') || major || '?';

  let label = String(name ?? '').trim();
  // Strip full hierarchy code prefix: 002-000-000_… / 002-000-000 …
  label = label.replace(/^\d{3}(?:-\d{3}){0,3}[_\s-]*/i, '');
  // Strip leading short index: 02- / 2. / 03_
  label = label.replace(/^\d{1,3}[-_.\s]+/, '');
  // Underscores → spaces; kebab leftovers like planning-&-procurement → spaces
  label = label.replace(/_/g, ' ').replace(/-\s*&\s*-/g, ' & ').replace(/-/g, ' ');
  label = label.replace(/\s*&\s*/g, ' & ').replace(/\s+/g, ' ').trim();
  if (!label) label = 'Department';
  else {
    label = label
      .split(' ')
      .map((word) => {
        if (!word) return word;
        if (word === '&') return '&';
        const lower = word.toLowerCase();
        if (['and', 'or', 'of', 'the', 'a', 'an'].includes(lower)) return lower;
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      })
      .join(' ');
    label = label.charAt(0).toUpperCase() + label.slice(1);
  }
  return `${shortNum}- ${label}`;
}

export function folderOrgDepartmentName(
  folder: Pick<DepartmentFolder, 'hanaDepartmentName' | 'orgDepartmentName'>,
): string {
  return folder.hanaDepartmentName?.trim() || folder.orgDepartmentName?.trim() || '—';
}
