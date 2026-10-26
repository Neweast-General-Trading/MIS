import type { ActivityTemplateField } from 'src/sections/bpm/storage';

function nk(s: string): string {
  return s.trim().toLowerCase().replace(/[\s._-]+/g, '');
}

/** Matches template rows that correspond to persisted Sub-process name (not arbitrary "name" labels). */
export function templateFieldIsEmbeddedActivityName(f: ActivityTemplateField): boolean {
  const key = nk(f.key);
  if (
    key === 'activityname' ||
    key === 'activity_name' ||
    key === 'subprocessname' ||
    key === 'sub_process_name'
  ) {
    return true;
  }
  const l = f.label.trim().toLowerCase();
  return (
    l === 'activity name' ||
    l === 'sub-process name' ||
    l === 'sub process name' ||
    l.includes('sub-process name')
  );
}

/** Matches template rows for persisted Activity / Sub-process description. */
export function templateFieldIsEmbeddedActivityDescription(f: ActivityTemplateField): boolean {
  const key = nk(f.key);
  if (
    key === 'activitydescription' ||
    key === 'activity_description' ||
    key === 'subprocessdescription' ||
    key === 'sub_process_description'
  ) {
    return true;
  }
  const l = f.label.trim().toLowerCase();
  return (
    l === 'activity description' ||
    l === 'sub-process description' ||
    l === 'sub process description' ||
    l.includes('sub-process description')
  );
}
