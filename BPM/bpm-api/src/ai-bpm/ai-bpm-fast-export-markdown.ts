/**
 * Server-built Word body from BPM data (all columns, no invented text).
 * Claude only adds short grounded narrative on top.
 */

import {
  buildAuthoritativeDataMarkdown,
  type TemplateColumn,
} from './ai-bpm-authoritative-data';
import { formatTableCell, resolveDetailValue } from './ai-bpm-detail-values';
import {
  relatedPolicyMarkdown,
  relatedSubProcessMarkdown,
  type RelatedSubProcessWordLink,
  type WordPolicyDocument,
} from './ai-bpm-policy-word.util';

type SubProcessRow = {
  code: string;
  sln?: number;
  activityName: string;
  activityDescription?: string | null;
  status: string;
  owners: string[];
  parentCode?: string | null;
  relatedSubProcesses?: Array<string | RelatedSubProcessWordLink>;
  relatedPolicies?: string[];
  relatedPolicyDocuments?: WordPolicyDocument[];
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
    activityTemplateName?: string | null;
  };
  subProcesses: SubProcessRow[];
  templateColumns?: TemplateColumn[];
};

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

function foldFieldKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[''`´']/g, '')
    .replace(/[\s._\-()/]+/g, '');
}

/** Core register fields — never repeat as template/detail columns. */
const CORE_REGISTER_FOLDS = new Set(
  [
    'sln',
    'sino',
    'code',
    'activitycode',
    'name',
    'activityname',
    'description',
    'activitydescription',
    'status',
    'owners',
    'owner',
    'parent',
    'parentcode',
    'parentactivityid',
  ].map(foldFieldKey),
);

/** Exact match only — do not drop rich AI prose that merely mentions the description. */
function nearDuplicateText(a?: string | null, b?: string | null): boolean {
  const na = String(a ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  const nb = String(b ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return Boolean(na && nb && na === nb);
}

/** Description column: activityDescription, else details aliases used in BPM templates. */
function resolveActivityDescription(sp: SubProcessRow): string {
  const direct = String(sp.activityDescription ?? '').trim();
  if (direct) return direct;
  const fromDetails = detailByAliases(sp.details, [
    'description',
    'activitydescription',
    'activity description',
    'stepdescription',
    'detaileddescription',
    'processdescription',
    'subprocessdescription',
  ]);
  return fromDetails && fromDetails !== '—' ? fromDetails : '';
}

/** When Claude skips a code, still put a useful grounded paragraph above the table. */
function buildFallbackAnalysis(sp: SubProcessRow): string {
  const desc = resolveActivityDescription(sp);
  const goal = detailByAliases(sp.details, [
    'goal',
    'goalobjectiveoftheprocess',
    'objective',
    'goal/objectiveoftheprocess',
  ]);
  const data = detailByAliases(sp.details, ['data']);
  const support = detailByAliases(sp.details, ['support']);
  const actType = detailByAliases(sp.details, [
    'activitytype',
    'orchestrationtype',
  ]);
  const system = detailByAliases(sp.details, [
    'systemapplicationimpacted',
    'system',
    'application',
  ]);
  const owners = (sp.owners ?? []).filter((o) => o.trim());
  const r =
    detailByAliases(sp.details, [
      'responsible',
      'responsiblerole',
      'responsibility',
    ]) || owners[0] || '';
  const a =
    detailByAliases(sp.details, ['accountable', 'accountability']) ||
    owners[0] ||
    '';

  const bits: string[] = [];
  if (desc) {
    bits.push(desc);
  } else if (goal && goal !== '—') {
    bits.push(
      `This step (${sp.code} — ${sp.activityName}) aims to: ${goal}.`,
    );
  } else {
    bits.push(
      `This step (${sp.code} — ${sp.activityName}) is part of the process sequence.`,
    );
  }
  if (r || a) {
    bits.push(
      `Responsible/Accountable: ${[r, a].filter(Boolean).join(' / ') || '—'}.`,
    );
  }
  if (actType && actType !== '—') {
    bits.push(`Execution type: ${actType}.`);
  }
  if (system && system !== '—' && system.toUpperCase() !== 'NA') {
    bits.push(`System/application: ${system}.`);
  }
  if (data && data !== '—') {
    bits.push(`Key data involved: ${data}.`);
  }
  if (support && support !== '—') {
    bits.push(`Support/channel: ${support}.`);
  }
  return bits.join(' ');
}

function ensureAnalysesForAllRows(
  rows: SubProcessRow[],
  analysesByCode: Map<string, string>,
): Map<string, string> {
  const out = new Map(analysesByCode);
  for (const sp of rows) {
    const code = sp.code.trim();
    const existing = out.get(code)?.trim() ?? '';
    const desc = resolveActivityDescription(sp);
    if (
      existing &&
      !nearDuplicateText(existing, desc) &&
      !nearDuplicateText(existing, sp.activityName)
    ) {
      continue;
    }
    out.set(code, buildFallbackAnalysis(sp));
  }
  return out;
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

function catalogueTable(rows: SubProcessRow[]): string {
  const lines = [
    '| SLN | Code | Name | Status | Owners | Parent |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const sp of sorted(rows)) {
    lines.push(
      `| ${esc(sp.sln)} | ${esc(sp.code)} | ${esc(sp.activityName)} | ${esc(sp.status)} | ${esc(sp.owners)} | ${esc(sp.parentCode)} |`,
    );
  }
  return lines.join('\n');
}

function raciTable(rows: SubProcessRow[]): string {
  const lines = [
    '| Code | Step name | R | A | C | I | Support | VI | SI |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const sp of sorted(rows)) {
    const owners = sp.owners ?? [];
    const r =
      detailByAliases(sp.details, [
        'responsible',
        'responsiblerole',
        'responsibility',
        'responsbility',
      ]) ||
      owners[0] ||
      '—';
    const a =
      detailByAliases(sp.details, ['accountable', 'accountability']) ||
      owners[0] ||
      '—';
    const c =
      detailByAliases(sp.details, ['consulted', 'consulting']) || '—';
    const i = detailByAliases(sp.details, ['informed', 'inform']) || '—';
    const support = detailByAliases(sp.details, ['support']) || '—';
    const vi =
      detailByAliases(sp.details, ['verificationvi', 'verification', 'vi']) ||
      '—';
    const si =
      detailByAliases(sp.details, ['signatorysi', 'signatory', 'si']) || '—';
    lines.push(
      `| ${esc(sp.code)} | ${esc(sp.activityName)} | ${esc(r)} | ${esc(a)} | ${esc(c)} | ${esc(i)} | ${esc(support)} | ${esc(vi)} | ${esc(si)} |`,
    );
  }
  return lines.join('\n');
}

function fullRegister(
  rows: SubProcessRow[],
  columns: TemplateColumn[],
  analysesByCode: Map<string, string> = new Map(),
): string {
  const blocks: string[] = [];
  for (const sp of sorted(rows)) {
    blocks.push(`### ${sp.code} — ${sp.activityName}`);
    blocks.push('');
    const descText = resolveActivityDescription(sp);
    const analysis = analysesByCode.get(sp.code.trim())?.trim();
    if (analysis) {
      blocks.push(analysis);
      blocks.push('');
    }
    // 1) Sub-process content — each field once
    blocks.push('| Field | Value |');
    blocks.push('| --- | --- |');
    blocks.push(`| SLN | ${esc(sp.sln)} |`);
    blocks.push(`| Code | ${esc(sp.code)} |`);
    blocks.push(`| Name | ${esc(sp.activityName)} |`);
    blocks.push(`| Description | ${esc(descText || sp.activityDescription)} |`);
    blocks.push(`| Status | ${esc(sp.status)} |`);
    blocks.push(`| Owners | ${esc(sp.owners)} |`);
    blocks.push(`| Parent | ${esc(sp.parentCode)} |`);
    const usedFold = new Set<string>(CORE_REGISTER_FOLDS);
    if (columns.length) {
      for (const col of columns) {
        const fk = foldFieldKey(col.key);
        const fl = foldFieldKey(col.label);
        if (usedFold.has(fk) || usedFold.has(fl)) continue;
        usedFold.add(fk);
        usedFold.add(fl);
        blocks.push(
          `| ${esc(col.label)} | ${esc(resolveColumnValue(sp.details, col))} |`,
        );
      }
      for (const [key, value] of Object.entries(sp.details ?? {})) {
        if (usedFold.has(foldFieldKey(key))) continue;
        if (!formatTableCell(value) || formatTableCell(value) === '—') continue;
        usedFold.add(foldFieldKey(key));
        blocks.push(`| ${esc(key)} | ${esc(value)} |`);
      }
    } else {
      for (const [key, value] of Object.entries(sp.details ?? {})) {
        if (usedFold.has(foldFieldKey(key))) continue;
        usedFold.add(foldFieldKey(key));
        blocks.push(`| ${esc(key)} | ${esc(value)} |`);
      }
    }
    // 2) Related sub-process title  3) Policy body
    blocks.push('');
    const relatedSpMd = relatedSubProcessMarkdown(sp.relatedSubProcesses ?? []);
    if (relatedSpMd) blocks.push(relatedSpMd);
    const relatedPolicyMd = relatedPolicyMarkdown(
      sp.relatedPolicyDocuments ?? [],
    );
    if (relatedPolicyMd) blocks.push(relatedPolicyMd);
  }
  return blocks.join('\n');
}

function swimlaneTable(rows: SubProcessRow[]): string {
  const ordered = sorted(rows);
  if (!ordered.length) {
    return '| Lane | Phase 1 | Phase 2 | Phase 3 |\n| --- | --- | --- | --- |\n| — | — | — | — |';
  }
  const n = ordered.length;
  const cut1 = Math.max(1, Math.ceil(n / 3));
  const cut2 = Math.max(cut1 + 1, Math.ceil((2 * n) / 3));
  const buckets = [
    ordered.slice(0, cut1),
    ordered.slice(cut1, cut2),
    ordered.slice(cut2),
  ];
  const lanes = new Set<string>();
  for (const sp of ordered) {
    for (const o of sp.owners ?? []) if (o.trim()) lanes.add(o.trim());
  }
  if (!lanes.size) lanes.add('Process owner');
  const lines = [
    '| Lane | Phase 1 | Phase 2 | Phase 3 |',
    '| --- | --- | --- | --- |',
  ];
  for (const lane of [...lanes].sort((a, b) => a.localeCompare(b))) {
    const cells = buckets.map((bucket) => {
      const codes = bucket
        .filter(
          (sp) =>
            (sp.owners ?? []).some((o) => o.trim() === lane) ||
            (!(sp.owners ?? []).length && lane === 'Process owner'),
        )
        .map((sp) => sp.code);
      return codes.join(', ') || '—';
    });
    lines.push(`| ${esc(lane)} | ${esc(cells[0])} | ${esc(cells[1])} | ${esc(cells[2])} |`);
  }
  return lines.join('\n');
}

function sequenceList(rows: SubProcessRow[]): string {
  return sorted(rows)
    .map(
      (sp, i) =>
        `${i + 1}. ${sp.code} — ${sp.activityName}`,
    )
    .join('\n');
}

/** Compact data for Claude (no giant full-field dump). */
export function buildClaudeCompactContext(slice: ProcessSlice): string {
  const auth = buildAuthoritativeDataMarkdown({
    meta: { scope: 'process' },
    process: slice.process,
    subProcesses: slice.subProcesses,
    templateColumns: slice.templateColumns,
  });
  // Drop the FULL FIELD REGISTER from Claude context — server inserts it.
  return auth
    .replace(
      /#### FULL FIELD REGISTER[\s\S]*$/m,
      '#### FULL FIELD REGISTER\n(omitted here — already inserted in Word by the server; do not regenerate it)\n',
    )
    .slice(0, 28_000);
}

/** Split Claude markdown into ## sections by heading number/title. */
function extractClaudeSections(markdown: string): Record<string, string> {
  const text = markdown.replace(/\r\n/g, '\n').replace(/^#\s+[^\n]+\n+/, '').trim();
  const lines = text.split('\n');
  const sections: Record<string, string> = {};
  let currentKey = 'preamble';
  let buf: string[] = [];

  const flush = () => {
    const body = buf.join('\n').trim();
    if (body) sections[currentKey] = body;
    buf = [];
  };

  for (const line of lines) {
    const m = line.match(/^##\s+(\d+(?:\.\d+)?)(?:\.\s*|\s+)(.+)$/);
    if (m) {
      flush();
      const num = m[1];
      if (num.startsWith('2')) currentKey = 'summary';
      else if (num.startsWith('3')) currentKey = 'overview';
      else if (num.startsWith('5')) currentKey = 'analysis';
      else if (num.startsWith('7')) currentKey = 'flow';
      else if (num.startsWith('8')) currentKey = 'gaps';
      else if (num.startsWith('10') || /glossary/i.test(m[2] ?? '')) currentKey = 'glossary';
      else if (num.startsWith('11') || /sop|operating procedure/i.test(m[2] ?? '')) currentKey = 'sop';
      else currentKey = `other-${num}`;
      buf.push(line);
      continue;
    }
    buf.push(line);
  }
  flush();
  return sections;
}

/** Parse Claude §5 blocks: ### CODE — Name → prose (heading stripped). */
export function extractSubProcessAnalyses(sectionMd: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!sectionMd?.trim()) return map;

  const lines = sectionMd.replace(/\r\n/g, '\n').split('\n');
  let code = '';
  let buf: string[] = [];

  const flush = () => {
    const body = buf.join('\n').trim();
    if (code && body) map.set(code, body);
    buf = [];
  };

  for (const line of lines) {
    if (/^##\s+/.test(line)) continue;
    const m = line.match(/^###\s+(\S+)\s+[—–\-]\s+.+$/);
    if (m) {
      flush();
      code = m[1].trim();
      continue;
    }
    if (code) buf.push(line);
  }
  flush();
  return map;
}

/**
 * Merge Claude narrative (short) + server-built factual tables (complete columns).
 * No invented filler from the server.
 */
export function assembleFastExportMarkdown(opts: {
  processCode: string;
  processName: string;
  companyCode?: string | null;
  templateName?: string | null;
  processOwners?: string[];
  subProcesses: SubProcessRow[];
  templateColumns?: TemplateColumn[];
  claudeNarrativeMarkdown: string;
}): string {
  const columns = opts.templateColumns ?? [];
  const rows = opts.subProcesses;
  const parts = extractClaudeSections(opts.claudeNarrativeMarkdown);
  // Prefer §5, but also scrape ### code blocks from the whole narrative if truncated mid-section.
  const analysesByCode = ensureAnalysesForAllRows(
    rows,
    extractSubProcessAnalyses(
      [parts.analysis ?? '', opts.claudeNarrativeMarkdown].join('\n\n'),
    ),
  );

  const summary =
    parts.summary?.trim() ||
    '## 2. Executive summary\n\n—';
  const overview =
    parts.overview?.trim() ||
    '## 3. Process overview\n\n—';
  const flow =
    parts.flow?.trim() ||
    '### 7.1 End-to-end process flow\n\n—';
  const gaps =
    parts.gaps?.trim() ||
    '## 8. Gaps and observations\n\n—';
  const glossary = parts.glossary?.trim() || '';
  const sop = parts.sop?.trim() || '';

  const markdown = [
    `## 1. Document control`,
    '',
    '| Field | Value |',
    '| --- | --- |',
    `| Process code | ${esc(opts.processCode)} |`,
    `| Process name | ${esc(opts.processName)} |`,
    `| Company | ${esc(opts.companyCode)} |`,
    `| Template | ${esc(opts.templateName)} |`,
    `| Owners | ${esc(opts.processOwners)} |`,
    `| Sub-process count | ${rows.length} |`,
    '',
    summary,
    '',
    overview,
    '',
    `## 4. Sub-process catalogue`,
    '',
    catalogueTable(rows),
    '',
    `## 5. Detailed sub-process register`,
    '',
    fullRegister(rows, columns, analysesByCode),
    `## 6. RACI and governance matrix`,
    '',
    raciTable(rows),
    '',
    `## 7. Process flows and swimlanes`,
    '',
    flow.startsWith('##') ? flow.replace(/^##\s+7[^\n]*/m, '### 7.1 End-to-end process flow') : flow,
    '',
    `### 7.2 Sequence`,
    '',
    sequenceList(rows),
    '',
    `### 7.3 Swimlane matrix`,
    '',
    swimlaneTable(rows),
    '',
    gaps,
    '',
    glossary,
    glossary ? '\n' : '',
    sop,
    sop ? '\n' : '',
    `## 9. Appendix`,
    '',
    `| Field | Value |`,
    `| --- | --- |`,
    `| Template columns | ${columns.length || 'inferred from data'} |`,
    `| Generated from | BPM live data |`,
    `| Sub-process rows exported | ${rows.length} |`,
    '',
  ].join('\n');

  return ensureCompleteExportMarkdown({
    markdown,
    subProcesses: rows,
    templateColumns: columns,
  });
}

/**
 * Append only sub-processes whose codes never appeared in the body.
 * Do NOT re-dump every row when a template label is merely renamed/folded
 * (Activity Name → Name, Si No → SLN) — that duplicated catalogue + Field|Value
 * tables and inflated DOCX size on large processes / process-function packs.
 */
export function ensureCompleteExportMarkdown(opts: {
  markdown: string;
  subProcesses: SubProcessRow[];
  templateColumns?: TemplateColumn[];
}): string {
  const rows = sorted(opts.subProcesses);
  const columns = opts.templateColumns ?? [];
  const missingCodes = rows.filter((sp) => !opts.markdown.includes(sp.code));
  if (!missingCodes.length) {
    return opts.markdown;
  }
  return [
    opts.markdown.trimEnd(),
    '',
    '## Completeness supplement',
    '',
    'The following BPM rows were missing from the generated body and are included from live data.',
    '',
    catalogueTable(missingCodes),
    '',
    fullRegister(missingCodes, columns),
    '',
  ].join('\n');
}
