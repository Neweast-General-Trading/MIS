/**
 * Authoritative BPM tables injected into Claude Word prompts.
 * Includes EVERY template column (even empty → —) so nothing is skipped.
 */

import {
  alignDetailsToTemplateColumns,
  formatTableCell,
  resolveDetailValue,
  type TemplateColumn,
} from './ai-bpm-detail-values';

export type { TemplateColumn };
export { alignDetailsToTemplateColumns };

type SubProcessRow = {
  code: string;
  sln?: number;
  activityName: string;
  activityDescription?: string | null;
  status: string;
  owners: string[];
  parentCode?: string | null;
  details?: Record<string, string | string[]>;
};

type ProcessSlice = {
  process: {
    code: string;
    processName: string;
    name: string;
    processOwners?: string[];
    processDescription?: string | null;
    description?: string | null;
    companyCode?: string | null;
    activityTemplateId?: string | null;
    activityTemplateName?: string | null;
  };
  subProcesses: SubProcessRow[];
  templateColumns?: TemplateColumn[];
};

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/[\s._\-()/]+/g, '');
}

function esc(value: unknown): string {
  return formatTableCell(value);
}

function sorted(rows: SubProcessRow[]): SubProcessRow[] {
  return rows
    .slice()
    .sort((a, b) => (a.sln ?? 0) - (b.sln ?? 0) || a.code.localeCompare(b.code));
}

function resolveColumnValue(
  details: Record<string, string | string[]> | undefined,
  column: TemplateColumn,
): string {
  return resolveDetailValue(details, column);
}

function detailByAliases(
  details: Record<string, string | string[]> | undefined,
  aliases: string[],
): string {
  for (const alias of aliases) {
    const text = formatTableCell(
      resolveDetailValue(details, { key: alias, label: alias }),
    );
    if (text !== '—') return text;
  }
  return '';
}

/** Infer columns from data when no template is attached. */
export function inferTemplateColumns(
  subProcesses: SubProcessRow[],
): TemplateColumn[] {
  const seen = new Map<string, TemplateColumn>();
  const coreSkip = new Set(
    [
      'sino',
      'sln',
      'activityid',
      'activityname',
      'activitydescription',
      'processid',
      'processid',
    ].map(norm),
  );

  for (const sp of subProcesses) {
    for (const key of Object.keys(sp.details ?? {})) {
      const n = norm(key);
      if (!n || coreSkip.has(n) || seen.has(n)) continue;
      seen.set(n, { key, label: key });
    }
  }
  return [...seen.values()];
}

function catalogueMarkdown(subProcesses: SubProcessRow[]): string {
  const lines = [
    '| SLN | Code | Name | Status | Owners | Parent |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const sp of sorted(subProcesses)) {
    lines.push(
      `| ${esc(sp.sln)} | ${esc(sp.code)} | ${esc(sp.activityName)} | ${esc(sp.status)} | ${esc(sp.owners)} | ${esc(sp.parentCode)} |`,
    );
  }
  return lines.join('\n');
}

function raciMarkdown(subProcesses: SubProcessRow[]): string {
  const lines = [
    '| Code | Step name | R | A | C | I | Support | VI | SI | Notes |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const sp of sorted(subProcesses)) {
    const owners = sp.owners ?? [];
    const r =
      detailByAliases(sp.details, [
        'responsible',
        'responsiblerole',
        'responsibility',
        'responsbility',
        'r',
        'racir',
        'raciresponsible',
      ]) ||
      owners[0] ||
      '—';
    const a =
      detailByAliases(sp.details, [
        'accountable',
        'accountability',
        'a',
        'racia',
        'raciaccountable',
      ]) ||
      owners[0] ||
      '—';
    const c =
      detailByAliases(sp.details, [
        'consulted',
        'consulting',
        'c',
        'racic',
        'raciconsulted',
      ]) || '—';
    const i =
      detailByAliases(sp.details, [
        'informed',
        'inform',
        'i',
        'racii',
        'raciinformed',
      ]) || '—';
    const support =
      detailByAliases(sp.details, ['support', 'supportrole']) || '—';
    const vi =
      detailByAliases(sp.details, [
        'verificationvi',
        'verification',
        'verifyvi',
        'vi',
      ]) || '—';
    const si =
      detailByAliases(sp.details, [
        'signatorysi',
        'signatory',
        'si',
      ]) || '—';
    lines.push(
      `| ${esc(sp.code)} | ${esc(sp.activityName)} | ${esc(r)} | ${esc(a)} | ${esc(c)} | ${esc(i)} | ${esc(support)} | ${esc(vi)} | ${esc(si)} | ${esc(sp.status)} |`,
    );
  }
  return lines.join('\n');
}

function sequenceMarkdown(subProcesses: SubProcessRow[]): string {
  return sorted(subProcesses)
    .map(
      (sp, index) =>
        `${index + 1}. ${sp.code} — ${sp.activityName} (status: ${sp.status || 'Draft'}; owners: ${(sp.owners ?? []).join(', ') || '—'})`,
    )
    .join('\n');
}

function columnInventoryMarkdown(columns: TemplateColumn[]): string {
  if (!columns.length) return '_No template columns resolved._';
  const lines = [
    '| # | Column key | Column label |',
    '| --- | --- | --- |',
  ];
  columns.forEach((col, index) => {
    lines.push(`| ${index + 1} | ${esc(col.key)} | ${esc(col.label)} |`);
  });
  return lines.join('\n');
}

function completenessMarkdown(
  subProcesses: SubProcessRow[],
  columns: TemplateColumn[],
): string {
  if (!columns.length) return '_No columns to audit._';
  const lines = [
    '| Column | Filled steps | Empty steps | Fill % |',
    '| --- | --- | --- | --- |',
  ];
  const ordered = sorted(subProcesses);
  for (const col of columns) {
    let filled = 0;
    for (const sp of ordered) {
      if (resolveColumnValue(sp.details, col)) filled += 1;
    }
    const empty = ordered.length - filled;
    const pct = ordered.length
      ? Math.round((filled / ordered.length) * 100)
      : 0;
    lines.push(
      `| ${esc(col.label)} | ${filled} | ${empty} | ${pct}% |`,
    );
  }
  return lines.join('\n');
}

function fullFieldRegisterMarkdown(
  subProcesses: SubProcessRow[],
  columns: TemplateColumn[],
): string {
  const blocks: string[] = [];
  for (const sp of sorted(subProcesses)) {
    blocks.push(`##### FULL FIELDS — ${sp.code} — ${sp.activityName}`);
    blocks.push('');
    blocks.push('| Field | Value |');
    blocks.push('| --- | --- |');
    blocks.push(`| SLN | ${esc(sp.sln)} |`);
    blocks.push(`| Code | ${esc(sp.code)} |`);
    blocks.push(`| Name | ${esc(sp.activityName)} |`);
    blocks.push(`| Description | ${esc(sp.activityDescription)} |`);
    blocks.push(`| Status | ${esc(sp.status)} |`);
    blocks.push(`| Owners | ${esc(sp.owners)} |`);
    blocks.push(`| Parent | ${esc(sp.parentCode)} |`);

    const fold = (s: string) =>
      s
        .trim()
        .toLowerCase()
        .replace(/[''`´']/g, '')
        .replace(/[\s._\-()/]+/g, '');
    const used = new Set(
      [
        'sln',
        'code',
        'name',
        'description',
        'activitydescription',
        'activityname',
        'status',
        'owners',
        'parent',
        'parentcode',
      ].map(fold),
    );
    if (columns.length) {
      for (const col of columns) {
        const fk = fold(col.key);
        const fl = fold(col.label);
        if (used.has(fk) || used.has(fl)) continue;
        used.add(fk);
        used.add(fl);
        const value = resolveColumnValue(sp.details, col);
        blocks.push(`| ${esc(col.label)} | ${esc(value)} |`);
      }
    } else {
      for (const [key, value] of Object.entries(sp.details ?? {})) {
        if (used.has(fold(key))) continue;
        used.add(fold(key));
        blocks.push(`| ${esc(key)} | ${esc(value)} |`);
      }
    }
    blocks.push('');
  }
  return blocks.join('\n');
}

function thematicSliceMarkdown(
  title: string,
  subProcesses: SubProcessRow[],
  columns: TemplateColumn[],
  matcher: (label: string) => boolean,
): string {
  const matched = columns.filter((c) => matcher(c.label) || matcher(c.key));
  if (!matched.length) {
    return `#### ${title}\n_No matching template columns for this theme._\n`;
  }
  const header = ['Code', 'Step', ...matched.map((c) => c.label)];
  const lines = [
    `#### ${title}`,
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
  ];
  for (const sp of sorted(subProcesses)) {
    const cells = [
      esc(sp.code),
      esc(sp.activityName),
      ...matched.map((c) => esc(resolveColumnValue(sp.details, c))),
    ];
    lines.push(`| ${cells.join(' | ')} |`);
  }
  return `${lines.join('\n')}\n`;
}

function processBlock(slice: ProcessSlice): string {
  const p = slice.process;
  const name = p.processName?.trim() || p.name?.trim() || p.code;
  const ordered = sorted(slice.subProcesses);
  const columns =
    slice.templateColumns?.length
      ? slice.templateColumns
      : inferTemplateColumns(ordered);

  return [
    `### AUTHORITATIVE DATA — Process ${p.code} — ${name}`,
    '',
    `Process code: ${p.code}`,
    `Process name: ${name}`,
    `Company: ${p.companyCode || '—'}`,
    `Template: ${p.activityTemplateName || '—'}`,
    `Template columns (must all appear in Section 5): ${columns.length}`,
    `Owners: ${(p.processOwners ?? []).join(', ') || '—'}`,
    `Sub-process count: ${ordered.length}`,
    '',
    '#### Template column inventory (EVERY column must be covered — never skip)',
    columnInventoryMarkdown(columns),
    '',
    '#### Column completeness audit (use in analysis / gaps)',
    completenessMarkdown(ordered, columns),
    '',
    '#### Catalogue (copy into Section 4 — do not invent rows)',
    catalogueMarkdown(ordered),
    '',
    '#### RACI + governance roles (copy into Section 6 — do not invent rows)',
    raciMarkdown(ordered),
    '',
    thematicSliceMarkdown(
      'Risks matrix (copy / analyse in Section 8)',
      ordered,
      columns,
      (label) => /risk/i.test(label),
    ),
    thematicSliceMarkdown(
      'Controls / mitigation matrix (copy / analyse in Section 8)',
      ordered,
      columns,
      (label) => /control|mitigation|approvals?\s*req/i.test(label),
    ),
    thematicSliceMarkdown(
      'Compliance / policy / KPI matrix (copy / analyse in Section 8)',
      ordered,
      columns,
      (label) =>
        /compliance|policy|kpi|performance|frequency|exception/i.test(label),
    ),
    thematicSliceMarkdown(
      'Systems / TAT / FTE / documents matrix (copy / analyse in Section 8)',
      ordered,
      columns,
      (label) =>
        /system|application|tool|tat|fte|wait|delay|document|input|output|deliverable|audit trail|data/i.test(
          label,
        ),
    ),
    '#### Sequence (use this exact order for Section 7 flows)',
    sequenceMarkdown(ordered),
    '',
    '#### FULL FIELD REGISTER — paste each Field|Value block into Section 5 under the matching ### heading (include empty cells as —)',
    fullFieldRegisterMarkdown(ordered, columns),
  ].join('\n');
}

export function buildAuthoritativeDataMarkdown(exportJson: {
  meta: { scope: 'process' | 'processFunction' };
  processFunction?: { code: string; name: string; companyCode?: string };
  process?: ProcessSlice['process'];
  subProcesses?: SubProcessRow[];
  processes?: ProcessSlice[];
  templateColumns?: TemplateColumn[];
}): string {
  const header = [
    '--- AUTHORITATIVE BPM TABLES (COPY VERBATIM — DO NOT CHANGE CODES, NAMES, OR DROP COLUMNS) ---',
    'Source of truth for codes, RACI, and EVERY template column (including empty → —).',
    'You MUST include all template columns in Section 5 Field|Value tables.',
    'You MUST produce detailed analysis for risks, controls, compliance, systems/TAT, and RACI using the thematic matrices.',
    'Never invent sub-processes. Never skip a column because it is empty.',
    '',
  ];

  if (exportJson.meta.scope === 'process' && exportJson.process && exportJson.subProcesses) {
    return [
      ...header,
      processBlock({
        process: exportJson.process,
        subProcesses: exportJson.subProcesses,
        templateColumns: exportJson.templateColumns,
      }),
    ].join('\n');
  }

  const slices = exportJson.processes ?? [];
  return [
    ...header,
    ...slices.map((slice) =>
      processBlock({
        ...slice,
        templateColumns: slice.templateColumns ?? exportJson.templateColumns,
      }),
    ),
  ].join('\n\n');
}
