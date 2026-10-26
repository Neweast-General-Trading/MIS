/**
 * Document metadata exactly as Policy Creator derives it for its document view
 * (document code, authorisation, distribution list, version history, effective date).
 */

export type StoredApprovalStep = {
  groupOrder?: number;
  type?: string;
  assigneeName?: string;
  status?: string;
  signatureText?: string;
  levelLabel?: string;
  departmentName?: string;
};

export type PolicyMetaSource = {
  name?: string;
  version?: number;
  departmentName?: string;
  visibilityScope?: string;
  companyName?: string;
  companies?: Array<{ companyCode?: string; companyName?: string }>;
  createdAt?: string;
  createdByName?: string;
  submittedAt?: string;
  approvedAt?: string;
  publishedAt?: string;
  updatedAt?: string;
  approvalSteps?: StoredApprovalStep[];
};

export type PolicyDocumentMeta = {
  documentCode: string;
  visibility: string;
  distributionList: string;
  authorisers: Array<{
    label: string;
    name: string;
    role: string;
    signature: string;
  }>;
  versionHistory: Array<{
    version: string;
    date: string;
    approvedBy: string;
    reason: string;
  }>;
  effectiveDate: string;
};

const APPROVAL_STEP_LABELS: Record<string, string> = {
  requester: 'Requester',
  direct_manager: 'Direct Manager',
  second_level_manager: 'Second-Level Manager',
  additional_approver: 'Additional Approver',
  department_approver: 'Department Approver',
  escalated_approver: 'Escalated Approver',
  audit_team: 'Audit Team',
  audit_manager: 'Audit Manager',
};

export function formatPolicyVersionLabel(version: number | undefined): string {
  return Number.isFinite(version) ? `${version}.0` : '1.0';
}

export function formatDocumentDate(date?: string): string {
  if (!date) return '—';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
}

function companiesLabel(policy: PolicyMetaSource): string {
  const list = (
    policy.companies?.length
      ? policy.companies.map(
          (item) => item.companyName || item.companyCode || '',
        )
      : [policy.companyName ?? '']
  ).filter(Boolean);
  if (list.length <= 1) return list[0] ?? '';
  if (list.length === 2) return `${list[0]}, ${list[1]}`;
  return `${list[0]} +${list.length - 1} more`;
}

function approvalColumns(policy: PolicyMetaSource) {
  const grouped = new Map<number, StoredApprovalStep[]>();
  for (const step of policy.approvalSteps ?? []) {
    if (step.type === 'requester') continue;
    const order = Number(step.groupOrder ?? 0);
    grouped.set(order, [...(grouped.get(order) ?? []), step]);
  }
  const columns: Array<{
    label: string;
    step: StoredApprovalStep | null;
    assigneeName: string;
  }> = [];
  for (const [, steps] of [...grouped.entries()].sort(([a], [b]) => a - b)) {
    const type = steps[0]?.type;
    if (!type) continue;
    if (type === 'audit_team') {
      const approver =
        steps.find((step) => step.status === 'approved') ?? steps[0];
      columns.push({
        label: APPROVAL_STEP_LABELS.audit_team,
        step: approver.status === 'approved' ? approver : null,
        assigneeName: approver.assigneeName ?? '',
      });
      continue;
    }
    const step = steps[0];
    columns.push({
      label: APPROVAL_STEP_LABELS[type] ?? type,
      step: step.status === 'approved' ? step : null,
      assigneeName: step.assigneeName ?? '',
    });
  }
  return columns;
}

export function buildPolicyDocumentMeta(
  policy: PolicyMetaSource,
): PolicyDocumentMeta {
  const version = formatPolicyVersionLabel(policy.version);
  const dept =
    (policy.departmentName || 'GEN')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toUpperCase()
      .slice(0, 18) || 'GEN';
  const slug = (policy.name || 'Policy')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  const general = policy.visibilityScope === 'general';
  const columns = approvalColumns(policy);
  const signed = [...columns]
    .reverse()
    .find((column) => column.step?.signatureText?.trim());
  const latestApprover =
    signed?.assigneeName ||
    columns[columns.length - 1]?.assigneeName ||
    policy.createdByName ||
    '—';
  const numeric = Number(policy.version ?? 1);

  const rows = [
    {
      version: '1.0',
      date: formatDocumentDate(policy.createdAt),
      approvedBy: policy.createdByName || '—',
      reason: 'Initial formulation',
    },
  ];
  if (numeric > 1) {
    rows.push({
      version,
      date: formatDocumentDate(
        policy.publishedAt ?? policy.approvedAt ?? policy.updatedAt,
      ),
      approvedBy: latestApprover,
      reason: `Version ${numeric} update`,
    });
  } else if (policy.publishedAt || policy.approvedAt) {
    rows[0] = {
      version,
      date: formatDocumentDate(
        policy.publishedAt ?? policy.approvedAt ?? policy.createdAt,
      ),
      approvedBy: latestApprover,
      reason: 'Initial formulation',
    };
  }

  const companies = companiesLabel(policy);
  return {
    documentCode: `NEWEAST-${dept}-POL-${slug}_v${version}`,
    visibility: general ? 'General' : 'Department-specific',
    distributionList: general
      ? `All employees of ${companies}`
      : `${policy.departmentName ?? ''} employees · ${companies}`,
    authorisers: [
      {
        label: 'Changes & Reviewed By',
        name: policy.createdByName || '—',
        role: 'Document owner',
        signature: '',
      },
      ...columns.map((column) => ({
        label: column.label || 'Approved By',
        name: column.assigneeName,
        role:
          column.step?.levelLabel ||
          column.step?.departmentName ||
          column.label,
        signature: column.step?.signatureText?.trim() || '',
      })),
    ],
    versionHistory: rows,
    effectiveDate: policy.publishedAt
      ? formatDocumentDate(policy.publishedAt)
      : '',
  };
}
