import type { ActivityTemplateField } from 'src/sections/bpm/storage';

export type FieldGroupId = 'classification' | 'timing' | 'roles' | 'systems';

export type FieldGroupDef = {
  id: FieldGroupId;
  title: string;
  /** Theme palette colour used for the accent bar. */
  color: 'info' | 'warning' | 'error' | 'success';
  /** Normalised label / key names, in display order. */
  names: string[];
};

const norm = (s: string | undefined | null) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** The free-text "Data" field – shown directly beneath the description. */
export function isDataField(field: Pick<ActivityTemplateField, 'key' | 'label'>): boolean {
  const names = ['data', 'datainformation'];
  return names.includes(norm(field.label)) || names.includes(norm(field.key));
}

/** "Exception Description" / "Exception Mitigation/Action" – always full-width text. */
export function isExceptionField(field: Pick<ActivityTemplateField, 'key' | 'label'>): boolean {
  return norm(field.label).startsWith('exception') || norm(field.key).startsWith('exception');
}

/** Short-value fields that read best side by side (cards). */
export const FIELD_GROUPS: FieldGroupDef[] = [
  {
    id: 'classification',
    title: 'Classification',
    color: 'info',
    names: ['activitytype', 'scopeinoutoftheprocess', 'orchestrationtype', 'noofftesinteractions'],
  },
  {
    id: 'timing',
    title: 'Timing & execution',
    color: 'warning',
    names: ['tat', 'tatminutes', 'waitdelaytime', 'waitdelaytimeminutes', 'processtype', 'frequency'],
  },
  {
    id: 'roles',
    title: 'Roles (RACI)',
    color: 'error',
    names: [
      'responsible',
      'accountable',
      'consulted',
      'informed',
      'verificationvi',
      'signatorysi',
    ],
  },
  {
    id: 'systems',
    title: 'Systems & applications',
    color: 'success',
    names: ['support', 'systemapplicationimpacted', 'systemtoolused'],
  },
];

function groupOrder(group: FieldGroupDef, field: Pick<ActivityTemplateField, 'key' | 'label'>): number {
  const label = norm(field.label);
  const key = norm(field.key);
  const byLabel = group.names.indexOf(label);
  if (byLabel >= 0) return byLabel;
  return group.names.indexOf(key);
}

export function groupForField(field: Pick<ActivityTemplateField, 'key' | 'label'>): FieldGroupDef | null {
  return FIELD_GROUPS.find((g) => groupOrder(g, field) >= 0) ?? null;
}

const SHORT_TYPES = new Set<ActivityTemplateField['type']>([
  'dropdown',
  'dropdown_multiselect',
  'dropdown_job_title',
  'dropdown_person_name',
  'app_master',
  'approval_flow',
  'oracle_job_role_multi',
  'person_multi',
  'job_title',
  'number',
  'numeric_days',
  'yes_no',
  'boolean',
]);

const MAX_SHORT_LENGTH = 48;

/** Single-word / few-word values (or any dropdown-like type) can sit next to each other. */
export function isShortValueField(field: ActivityTemplateField, currentValue: string): boolean {
  if (SHORT_TYPES.has(field.type)) return true;
  const v = currentValue.trim();
  if (!v) return field.type === 'text';
  return v.length <= MAX_SHORT_LENGTH && !v.includes('\n');
}

export type TemplateFieldLayout = {
  /** Auto-generated ids (SI.No, Activity ID). */
  identity: ActivityTemplateField[];
  /** Fields rendered as their own full-width card, in template order. */
  full: ActivityTemplateField[];
  groups: Array<{ def: FieldGroupDef; fields: ActivityTemplateField[] }>;
  /** Remaining short fields that are not part of a named group. */
  otherShort: ActivityTemplateField[];
  /** Approval flow fields (ordered levels) – shown right after the role cards. */
  approval: ActivityTemplateField[];
};

export function layoutTemplateFields(
  fields: ActivityTemplateField[],
  opts: {
    isIdentity: (f: ActivityTemplateField) => boolean;
    isFullWidthOnly: (f: ActivityTemplateField) => boolean;
    valueOf: (f: ActivityTemplateField) => string;
  },
): TemplateFieldLayout {
  const identity: ActivityTemplateField[] = [];
  const full: ActivityTemplateField[] = [];
  const otherShort: ActivityTemplateField[] = [];
  const approval: ActivityTemplateField[] = [];
  const grouped = new Map<FieldGroupId, ActivityTemplateField[]>();

  fields.forEach((f) => {
    if (opts.isIdentity(f)) {
      identity.push(f);
      return;
    }
    if (f.type === 'approval_flow') {
      approval.push(f);
      return;
    }
    if (opts.isFullWidthOnly(f)) {
      full.push(f);
      return;
    }
    const group = groupForField(f);
    if (group) {
      grouped.set(group.id, [...(grouped.get(group.id) ?? []), f]);
      return;
    }
    if (isShortValueField(f, opts.valueOf(f))) otherShort.push(f);
    else full.push(f);
  });

  const groups = FIELD_GROUPS.filter((g) => grouped.has(g.id)).map((def) => ({
    def,
    fields: [...(grouped.get(def.id) ?? [])].sort((a, b) => groupOrder(def, a) - groupOrder(def, b)),
  }));

  return { identity, full, groups, otherShort, approval };
}
