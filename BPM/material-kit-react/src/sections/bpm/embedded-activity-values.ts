import type { ActivityItem, ActivityTemplateField } from 'src/sections/bpm/storage';

import { detailValueAsString } from 'src/sections/bpm/components/bpm-template-detail-controls';

/**
 * Entity columns (`activityName`, `activityDescription`) are canonical when non-empty.
 * When imports/grid fill only `details[field.key]`, fall back so View/Edit match the table.
 */
export function resolveEmbeddedActivityDescription(
  activity: ActivityItem,
  field: ActivityTemplateField,
): string {
  const entity = String(activity.activityDescription ?? '').trim();
  if (entity) return activity.activityDescription ?? '';
  return detailValueAsString(field, activity.details?.[field.key]).trim();
}

export function resolveEmbeddedActivityName(
  activity: ActivityItem,
  field: ActivityTemplateField,
): string {
  const entity = String(activity.activityName ?? '').trim();
  if (entity) return activity.activityName ?? '';
  return detailValueAsString(field, activity.details?.[field.key]).trim();
}
