import type { ActivityTemplateField } from 'src/sections/bpm/storage';

/**
 * Template fields whose values are fixed (not free text). Keep in sync with
 * `bpm-api/src/common/activity-template-field-types.ts`.
 */
export type FixedTemplateFieldDef =
  | { kind: 'dropdown'; options: readonly string[] }
  | { kind: 'app_master' };

const norm = (s: string | undefined | null) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

const FIXED_FIELDS: Array<{ names: string[]; def: FixedTemplateFieldDef }> = [
  { names: ['scopeinoutoftheprocess'], def: { kind: 'dropdown', options: ['In Scope', 'Out Of Scope'] } },
  {
    names: ['orchestrationtype'],
    def: { kind: 'dropdown', options: ['Human-Human', 'Human-System', 'System-System', 'System-Human'] },
  },
  { names: ['support'], def: { kind: 'app_master' } },
  { names: ['systemapplicationimpacted'], def: { kind: 'app_master' } },
  {
    names: ['processtype'],
    def: { kind: 'dropdown', options: ['Manual', 'Semi-automated', 'Fully automated'] },
  },
  { names: ['frequency'], def: { kind: 'dropdown', options: ['Daily', 'Weekly', 'Ad-Hoc'] } },
];

export function matchFixedTemplateField(
  field: Pick<ActivityTemplateField, 'key' | 'label'>,
): FixedTemplateFieldDef | null {
  const label = norm(field.label);
  const key = norm(field.key);
  for (const entry of FIXED_FIELDS) {
    if (entry.names.includes(label) || entry.names.includes(key)) return entry.def;
  }
  return null;
}

/** Applies the locked type / options to a field (used by the template editor). */
export function withFixedFieldType<T extends ActivityTemplateField>(field: T): T {
  const def = matchFixedTemplateField(field);
  if (!def) return field;
  return def.kind === 'app_master'
    ? { ...field, type: 'app_master', options: [] }
    : { ...field, type: 'dropdown', options: [...def.options] };
}
