import type {
  BpmProcess,
  ActivityItem,
  DepartmentFolder,
  RelatedSubProcessLink,
} from 'src/sections/bpm/storage';

export function activityToRelatedSubProcessLink(
  activity: ActivityItem,
  processItem: BpmProcess,
  departmentFolder: DepartmentFolder,
): RelatedSubProcessLink {
  return {
    id: activity.id,
    code: activity.code,
    activityName: activity.activityName,
    activityDescription: activity.activityDescription ?? null,
    status: activity.status,
    owners: [...(activity.owners ?? [])],
    processId: processItem.id,
    processCode: processItem.code,
    processName: processItem.processName ?? processItem.name,
    departmentId: departmentFolder.id,
    departmentCode: departmentFolder.code,
    departmentName: departmentFolder.name,
    details: { ...(activity.details ?? {}) },
  };
}

/** Ensures links appear on both sides (main + each relative sub-process). */
export function buildBidirectionalRelatedLinksMap(
  activities: ActivityItem[],
  processItem: BpmProcess | null,
  departmentFolder: DepartmentFolder | null,
): Map<string, RelatedSubProcessLink[]> {
  const map = new Map<string, RelatedSubProcessLink[]>();
  if (!processItem || !departmentFolder) {
    return map;
  }

  for (const activity of activities) {
    map.set(activity.id, [...(activity.relatedSubProcesses ?? [])]);
  }

  for (const activity of activities) {
    const backLink = activityToRelatedSubProcessLink(activity, processItem, departmentFolder);
    for (const link of activity.relatedSubProcesses ?? []) {
      const peerLinks = map.get(link.id) ?? [];
      if (!peerLinks.some((item) => item.id === activity.id)) {
        map.set(link.id, [...peerLinks, backLink]);
      }
    }
  }

  for (const [id, links] of map) {
    const deduped = new Map<string, RelatedSubProcessLink>();
    for (const link of links) {
      deduped.set(link.id, link);
    }
    map.set(id, Array.from(deduped.values()));
  }

  return map;
}
