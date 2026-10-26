import type { ActivityTemplateField } from 'src/sections/bpm/storage';

export type TemplateFieldRow = ActivityTemplateField & { _rid: string };

function newRid(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `rid_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

export function emptyTemplateFieldRow(): TemplateFieldRow {
  return {
    key: '',
    label: '',
    type: 'text',
    openToDiscussion: false,
    options: [],
    _rid: newRid(),
  };
}

/** Stable row ids for React keys + drag reorder without remounting every cell. */
export function templateFieldsToRows(fields: ActivityTemplateField[]): TemplateFieldRow[] {
  return fields.map((f) => ({ ...f, _rid: newRid() }));
}

export function rowsToTemplateFields(rows: TemplateFieldRow[]): ActivityTemplateField[] {
  return rows.map(({ _rid, ...f }) => f);
}

export function reorderFieldRows(rows: TemplateFieldRow[], fromIndex: number, toIndex: number): TemplateFieldRow[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= rows.length || toIndex >= rows.length) {
    return rows;
  }
  const next = [...rows];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}
