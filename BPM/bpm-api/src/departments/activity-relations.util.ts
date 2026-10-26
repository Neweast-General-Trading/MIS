import type { ActivityEntity } from 'src/activities/entities/activity.entity';
import type { ActivityRelationEntity } from 'src/activities/entities/activity-relation.entity';

export type RelatedSubProcessSummary = {
  id: string;
  code: string;
  activityName: string;
  activityDescription: string | null;
  status: string;
  owners: string[];
  processId: string;
  processCode: string;
  processName: string;
  departmentId: string;
  departmentCode: string;
  departmentName: string;
  details: Record<string, string | string[]>;
};

export function toRelatedSubProcessSummary(
  activity: ActivityEntity & {
    process?: {
      id: string;
      code: string;
      processName: string;
      department?: { id: string; code: string; name: string } | null;
    } | null;
  },
): RelatedSubProcessSummary | null {
  const process = activity.process;
  const department = process?.department;
  if (!process || !department) {
    return null;
  }
  return {
    id: activity.id,
    code: activity.code,
    activityName: activity.activityName,
    activityDescription: activity.activityDescription ?? null,
    status: activity.status,
    owners: [...(activity.owners ?? [])],
    processId: process.id,
    processCode: process.code,
    processName: process.processName,
    departmentId: department.id,
    departmentCode: department.code,
    departmentName: department.name,
    details: { ...(activity.details ?? {}) },
  };
}

export function cloneRelatedSubProcessSummary(
  summary: RelatedSubProcessSummary,
): RelatedSubProcessSummary {
  return {
    ...summary,
    owners: [...summary.owners],
    details: { ...summary.details },
  };
}

export function buildRelatedSubProcessMap(
  relations: ActivityRelationEntity[],
  activityIdsInProcess: Set<string>,
  summariesById: Map<string, RelatedSubProcessSummary>,
): Map<string, RelatedSubProcessSummary[]> {
  const out = new Map<string, RelatedSubProcessSummary[]>();
  for (const activityId of activityIdsInProcess) {
    out.set(activityId, []);
  }

  for (const rel of relations) {
    if (activityIdsInProcess.has(rel.sourceActivityId)) {
      const target = summariesById.get(rel.targetActivityId);
      if (target) {
        out
          .get(rel.sourceActivityId)
          ?.push(cloneRelatedSubProcessSummary(target));
      }
    }
    if (activityIdsInProcess.has(rel.targetActivityId)) {
      const source = summariesById.get(rel.sourceActivityId);
      if (source) {
        out
          .get(rel.targetActivityId)
          ?.push(cloneRelatedSubProcessSummary(source));
      }
    }
  }

  for (const [id, links] of out) {
    const deduped = new Map<string, RelatedSubProcessSummary>();
    for (const link of links) {
      deduped.set(link.id, link);
    }
    out.set(id, Array.from(deduped.values()));
  }

  return out;
}
