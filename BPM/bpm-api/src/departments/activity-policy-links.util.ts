import type { ActivityPolicyLinkEntity } from 'src/activities/entities/activity-policy-link.entity';

export type RelatedPolicySummary = {
  id: string;
  policyCreatorPolicyId: string;
  policyName: string;
  policyVersion: number | null;
  companyCode: string | null;
  companyName: string | null;
  departmentName: string | null;
  processCode: string | null;
  processName: string | null;
  activityCode: string | null;
  policyCreatorUrl: string | null;
  linkedBy: string | null;
  linkedAt: string;
};

export function defaultPolicyCreatorUrl(policyCreatorPolicyId: string): string {
  const base =
    process.env.POLICY_CREATOR_BASE_URL?.trim() ||
    'https://policycreator.neweast.cloud';
  const normalizedBase = base.replace(/\/+$/, '');
  return `${normalizedBase}/?policy=${encodeURIComponent(policyCreatorPolicyId)}`;
}

export function toRelatedPolicySummary(
  link: ActivityPolicyLinkEntity,
): RelatedPolicySummary {
  return {
    id: link.id,
    policyCreatorPolicyId: link.policyCreatorPolicyId,
    policyName: link.policyName,
    policyVersion: link.policyVersion ?? null,
    companyCode: link.companyCode ?? null,
    companyName: link.companyName ?? null,
    departmentName: link.departmentName ?? null,
    processCode: link.processCode ?? null,
    processName: link.processName ?? null,
    activityCode: link.activityCode ?? null,
    policyCreatorUrl:
      link.policyCreatorUrl?.trim() ||
      defaultPolicyCreatorUrl(link.policyCreatorPolicyId),
    linkedBy: link.linkedBy ?? null,
    linkedAt:
      link.linkedAt instanceof Date
        ? link.linkedAt.toISOString()
        : String(link.linkedAt ?? ''),
  };
}

export function buildRelatedPolicyMap(
  links: ActivityPolicyLinkEntity[],
  activityIdsInProcess: Set<string>,
): Map<string, RelatedPolicySummary[]> {
  const out = new Map<string, RelatedPolicySummary[]>();
  for (const activityId of activityIdsInProcess) {
    out.set(activityId, []);
  }

  for (const link of links) {
    if (!activityIdsInProcess.has(link.activityId)) {
      continue;
    }
    out.get(link.activityId)?.push(toRelatedPolicySummary(link));
  }

  for (const [activityId, rows] of out) {
    rows.sort((a, b) => a.policyName.localeCompare(b.policyName));
    out.set(activityId, rows);
  }

  return out;
}
