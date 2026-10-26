/** Shared Activity Template field types (API + UI). */
export const ACTIVITY_TEMPLATE_FIELD_TYPES = [
  'text',
  'textarea',
  'yes_no',
  'dropdown_job_title',
  'dropdown_person_name',
  'dropdown_multiselect',
  'dropdown',
  'person_multi',
  'boolean',
  'job_title',
  'number',
  'numeric_days',
  'oracle_job_role_multi',
  'app_master',
  'approval_flow',
] as const;

export type ActivityTemplateFieldType =
  (typeof ACTIVITY_TEMPLATE_FIELD_TYPES)[number];

/**
 * Approval flow value: ordered list stored as `['Yes', 'Job role L1', 'Job role L2', ...]`
 * (or `['No']`). Level 1 is the first job role after the flag.
 */
export function isApprovalFlowType(type: string | undefined): boolean {
  return type === 'approval_flow';
}

export function parseApprovalFlow(value: unknown): {
  enabled: boolean;
  levels: string[];
} {
  const items = Array.isArray(value)
    ? value.map((v) => String(v ?? '').trim()).filter(Boolean)
    : String(value ?? '')
        .split(/[,;|\n]+/)
        .map((v) => v.trim())
        .filter(Boolean);
  const head = items[0]?.toLowerCase();
  const hasFlag = head === 'yes' || head === 'no';
  const levels = hasFlag ? items.slice(1) : items;
  const enabled = hasFlag ? head === 'yes' : levels.length > 0;
  return { enabled, levels: enabled ? levels : [] };
}

export function isOracleJobRoleMultiType(type: string | undefined): boolean {
  return type === 'oracle_job_role_multi';
}

export function isNumericDaysType(type: string | undefined): boolean {
  return type === 'numeric_days';
}

export function isNumberFieldType(type: string | undefined): boolean {
  return type === 'number';
}

// ---------------------------------------------------------------------------
// Application Master multi-select + fixed-value ("locked") template fields
// ---------------------------------------------------------------------------

export type FixedTemplateFieldDef =
  | { id: string; kind: 'dropdown'; options: readonly string[] }
  | { id: string; kind: 'app_master' };

function normalizeFixedFieldName(raw: string | undefined | null): string {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Template fields whose values are NOT free text. Matched by normalised field label or key. */
const FIXED_TEMPLATE_FIELDS: Array<{
  names: string[];
  def: FixedTemplateFieldDef;
}> = [
  {
    names: ['scopeinoutoftheprocess'],
    def: {
      id: 'scope',
      kind: 'dropdown',
      options: ['In Scope', 'Out Of Scope'],
    },
  },
  {
    names: ['orchestrationtype'],
    def: {
      id: 'orchestrationType',
      kind: 'dropdown',
      options: ['Human-Human', 'Human-System', 'System-System', 'System-Human'],
    },
  },
  { names: ['support'], def: { id: 'support', kind: 'app_master' } },
  {
    names: ['systemapplicationimpacted'],
    def: { id: 'systemImpacted', kind: 'app_master' },
  },
  {
    names: ['processtype'],
    def: {
      id: 'processType',
      kind: 'dropdown',
      options: ['Manual', 'Semi-automated', 'Fully automated'],
    },
  },
  {
    names: ['frequency'],
    def: {
      id: 'frequency',
      kind: 'dropdown',
      options: ['Daily', 'Weekly', 'Ad-Hoc'],
    },
  },
];

export function matchFixedTemplateField(field: {
  key?: string;
  label?: string;
}): FixedTemplateFieldDef | null {
  const label = normalizeFixedFieldName(field.label);
  const key = normalizeFixedFieldName(field.key);
  for (const entry of FIXED_TEMPLATE_FIELDS) {
    if (entry.names.includes(label) || entry.names.includes(key)) {
      return entry.def;
    }
  }
  return null;
}

export function isAppMasterType(type: string | undefined): boolean {
  return type === 'app_master';
}

/** Forces the type / options of fixed fields so a template cannot turn them back into free text. */
export function enforceFixedTemplateFields<
  T extends { key: string; label: string; type: string; options?: string[] },
>(fields: T[]): T[] {
  return fields.map((f) => {
    const def = matchFixedTemplateField(f);
    if (!def) return f;
    if (def.kind === 'app_master') {
      return { ...f, type: 'app_master', options: [] } as T;
    }
    return { ...f, type: 'dropdown', options: [...def.options] } as T;
  });
}

/** Case/spacing-insensitive lookup of a canonical option; null when the value is not allowed. */
export function canonicalFixedOption(
  options: readonly string[],
  value: string,
): string | null {
  const n = normalizeFixedFieldName(value);
  if (!n) return '';
  const hit = options.find((o) => normalizeFixedFieldName(o) === n);
  return hit ?? null;
}
