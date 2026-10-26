import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import {
  AlignmentType,
  Bookmark,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  InternalHyperlink,
  LeaderType,
  Packer,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableOfContents,
  TableRow,
  TabStopType,
  TextRun,
  VerticalAlign,
  WidthType,
  type ISectionOptions,
  type ParagraphChild,
} from 'docx';

import {
  buildCoverPageFooter,
  buildDocumentFooter,
  buildDocumentHeader,
  companyLogoParagraph,
  emptyFirstPageHeader,
} from './ai-bpm-docx-branding';
import { renderMermaidPngBest } from './ai-bpm-mermaid-images';
import {
  roleKey,
  stepRoleLinks,
  type JdMaster,
  type JdRole,
  type PipelineBundle,
  type ProcessStep,
  type SopMaster,
  type SummaryOverview,
} from './ai-bpm-json-pipeline';
import {
  htmlToRichBlocks,
  subProcessBookmarkId,
  type RelatedSubProcessWordLink,
  type WordPolicyDocument,
} from './ai-bpm-policy-word.util';

const execFileAsync = promisify(execFile);

/* ------------------------------------------------------------------ */
/* Design tokens                                                       */
/* ------------------------------------------------------------------ */

const C = {
  brand: '8B1E3F',
  brandDark: '5E1329',
  brandTint: 'F8ECEF',
  ink: '1F2937',
  muted: '6B7280',
  line: 'D9DEE5',
  zebra: 'F7F8FA',
  white: 'FFFFFF',
  blue: 'DCE9F7',
  blueInk: '1E4E8C',
  amber: 'FFF1CC',
  amberInk: '8A5A00',
  green: 'D9F2E1',
  greenInk: '1B6B3A',
  red: 'F8D7DA',
  redInk: '9B1C1C',
  grey: 'EEF0F3',
  greyInk: '4B5563',
  purple: 'E8DFF5',
  purpleInk: '5B3B96',
  policyAccent: 'ED1C24',
  policyBorder: 'E2E8F0',
  policyFill: 'F8FAFC',
};

/** One page size for the whole document. */
const PAGE_W = 10440;

export type PipelineDocMeta = {
  /** Whole process function, or one process. Decides which cover rows are shown. */
  scope?: 'process' | 'processFunction';
  title: string;
  processName: string;
  processCode: string;
  departmentName: string;
  departmentCode: string;
  companyCode: string;
  /** `<code> : <legal name>`, as shown for the related company. */
  companyName?: string;
  generatedAt: string;
  docxFilename: string;
};

type Block = Paragraph | Table;

type TocEntry = { id: string; title: string; level: 1 | 2 };

/* ------------------------------------------------------------------ */
/* Assembly state. Assembly is synchronous, so this is never shared.   */
/* ------------------------------------------------------------------ */

let tocEntries: TocEntry[] = [];
let tocCounter = 0;
let codePrefix = '';
let tocLevel: 1 | 2 = 1;

function registerToc(title: string, level: 1 | 2 = tocLevel): string {
  tocCounter += 1;
  const id = `toc_${tocCounter}`;
  tocEntries.push({ id, title, level });
  return id;
}

function setCodePrefix(steps: ProcessStep[]): void {
  const codes = steps.map((step) => step.Code).filter(Boolean);
  if (codes.length < 2) {
    codePrefix = '';
    return;
  }
  let prefix = codes[0];
  for (const code of codes) {
    while (prefix && !code.startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  const cut = prefix.lastIndexOf('-');
  codePrefix = cut > 0 ? prefix.slice(0, cut + 1) : '';
}

/** Shortens step codes inside long lists, e.g. 001-001-001-006 becomes 006. */
function sc(value: unknown): string {
  const text = str(value);
  return codePrefix ? text.split(codePrefix).join('') : text;
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asList(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? (value.filter((item) => item && typeof item === 'object') as Record<
        string,
        unknown
      >[])
    : [];
}

function asStrings(value: unknown): string[] {
  if (!Array.isArray(value))
    return value ? [String(value as string | number | boolean)] : [];
  return value.map((item) => str(item)).filter(Boolean);
}

function str(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value))
    return value
      .map((item) => str(item))
      .filter(Boolean)
      .join(', ');
  if (typeof value === 'object') return '';
  return String(value as string | number | boolean).trim();
}

type RunOpts = {
  size?: number;
  bold?: boolean;
  color?: string;
  italics?: boolean;
};

function run(value: string, opts: RunOpts = {}): TextRun {
  return new TextRun({
    text: value,
    font: 'Calibri',
    size: opts.size ?? 21,
    bold: opts.bold,
    italics: opts.italics,
    color: opts.color ?? C.ink,
  });
}

type ParaOpts = RunOpts & {
  align?: (typeof AlignmentType)[keyof typeof AlignmentType];
  before?: number;
  after?: number;
  keepNext?: boolean;
  fill?: string;
  barColor?: string;
  indent?: number;
  bullet?: boolean;
  pageBreak?: boolean;
};

function p(content: string | ParagraphChild[], opts: ParaOpts = {}): Paragraph {
  return new Paragraph({
    alignment: opts.align,
    keepNext: opts.keepNext,
    pageBreakBefore: opts.pageBreak,
    bullet: opts.bullet ? { level: 0 } : undefined,
    spacing: { before: opts.before ?? 60, after: opts.after ?? 60, line: 276 },
    indent: opts.indent ? { left: opts.indent } : undefined,
    shading: opts.fill
      ? { type: ShadingType.CLEAR, fill: opts.fill, color: 'auto' }
      : undefined,
    border: opts.barColor
      ? {
          left: {
            style: BorderStyle.SINGLE,
            size: 24,
            color: opts.barColor,
            space: 8,
          },
        }
      : undefined,
    children: typeof content === 'string' ? [run(content, opts)] : content,
  });
}

/** Section heading. Appears in the table of contents when `toc` is true. */
function h1(
  title: string,
  opts: { pageBreak?: boolean; toc?: boolean } = {},
): Paragraph {
  const toc = opts.toc ?? true;
  const label = run(title, { size: 32, bold: true, color: C.brand });
  const id = toc ? registerToc(title) : null;
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    pageBreakBefore: opts.pageBreak,
    keepNext: true,
    spacing: { before: 320, after: 160 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 12, color: C.brand, space: 4 },
    },
    children: id ? [new Bookmark({ id, children: [label] })] : [label],
  });
}

function h2(title: string, color = C.brandDark): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    keepNext: true,
    spacing: { before: 260, after: 100 },
    children: [run(title, { size: 26, bold: true, color })],
  });
}

function h3(title: string): Paragraph {
  return p(title, {
    bold: true,
    size: 22,
    color: C.brand,
    before: 160,
    after: 60,
    keepNext: true,
  });
}

function spacer(after = 120): Paragraph {
  return new Paragraph({ spacing: { before: 0, after }, children: [] });
}

function labelled(
  label: string,
  value: string,
  color = C.brand,
  fill = C.brandTint,
): Paragraph {
  return p(
    [
      run(`${label}  `, { bold: true, color, size: 20 }),
      run(value, { size: 20 }),
    ],
    {
      fill,
      barColor: color,
      indent: 160,
      before: 50,
      after: 50,
    },
  );
}

/* ---- tables ---- */

type Cell =
  | string
  | {
      t: string;
      fill?: string;
      color?: string;
      bold?: boolean;
      align?: (typeof AlignmentType)[keyof typeof AlignmentType];
      size?: number;
      blank?: boolean;
    };

const thinBorder = { style: BorderStyle.SINGLE, size: 4, color: C.line };
const allBorders = {
  top: thinBorder,
  bottom: thinBorder,
  left: thinBorder,
  right: thinBorder,
};

function mk(
  cell: Cell,
  width: number,
  base: { size?: number; fill?: string; bold?: boolean; color?: string },
): TableCell {
  const c = typeof cell === 'string' ? { t: cell } : cell;
  const lines = c.blank ? [''] : (c.t || '—').split('\n');
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    borders: allBorders,
    shading: {
      type: ShadingType.CLEAR,
      fill: c.fill ?? base.fill ?? C.white,
      color: 'auto',
    },
    children: lines.map(
      (line) =>
        new Paragraph({
          alignment: c.align,
          spacing: { before: 0, after: 0, line: 252 },
          children: [
            run(line, {
              size: c.size ?? base.size ?? 18,
              bold: c.bold ?? base.bold,
              color: c.color ?? base.color,
            }),
          ],
        }),
    ),
  });
}

function table(
  headers: string[],
  rows: Cell[][],
  fractions: number[] | null,
  size = 18,
): Table {
  const weights = fractions ?? headers.map(() => 1);
  const sum = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) => Math.floor((w / sum) * PAGE_W));
  const headRow = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: headers.map((head, i) =>
      mk({ t: head, fill: C.brand, color: C.white, bold: true }, widths[i], {
        size,
      }),
    ),
  });
  const body = rows.length
    ? rows.map(
        (row, index) =>
          new TableRow({
            cantSplit: true,
            children: row.map((cell, i) =>
              mk(cell, widths[i], {
                size,
                fill: index % 2 ? C.zebra : C.white,
              }),
            ),
          }),
      )
    : [
        new TableRow({
          children: headers.map((_, i) =>
            mk({ t: '—', color: C.muted }, widths[i], { size }),
          ),
        }),
      ];
  return new Table({
    width: { size: PAGE_W, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    rows: [headRow, ...body],
  });
}

function kv(rows: [string, string | Cell][]): Table {
  const left = Math.floor(PAGE_W * 0.26);
  return new Table({
    width: { size: PAGE_W, type: WidthType.DXA },
    columnWidths: [left, PAGE_W - left],
    layout: TableLayoutType.FIXED,
    rows: rows.map(
      ([label, value]) =>
        new TableRow({
          cantSplit: true,
          children: [
            mk(
              { t: label, fill: C.brandTint, bold: true, color: C.brandDark },
              left,
              { size: 19 },
            ),
            mk(value || '—', PAGE_W - left, { size: 19 }),
          ],
        }),
    ),
  });
}

function statCards(
  cards: {
    value: string;
    label: string;
    tone?: 'brand' | 'red' | 'green' | 'amber';
  }[],
): Table {
  const width = Math.floor(PAGE_W / cards.length);
  const tone = {
    brand: { fill: C.brandTint, ink: C.brand },
    red: { fill: C.red, ink: C.redInk },
    green: { fill: C.green, ink: C.greenInk },
    amber: { fill: C.amber, ink: C.amberInk },
  };
  return new Table({
    width: { size: width * cards.length, type: WidthType.DXA },
    columnWidths: cards.map(() => width),
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({
        children: cards.map((card) => {
          const t = tone[card.tone ?? 'brand'];
          return new TableCell({
            width: { size: width, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill: t.fill, color: 'auto' },
            margins: { top: 140, bottom: 140, left: 100, right: 100 },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 24, color: t.ink },
              bottom: { style: BorderStyle.SINGLE, size: 24, color: C.white },
              left: { style: BorderStyle.SINGLE, size: 24, color: C.white },
              right: { style: BorderStyle.SINGLE, size: 24, color: C.white },
            },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 0, after: 20 },
                children: [
                  run(card.value, { size: 44, bold: true, color: t.ink }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 0, after: 0 },
                children: [run(card.label, { size: 17, color: C.muted })],
              }),
            ],
          });
        }),
      }),
    ],
  });
}

/* ---- ratings and roles ---- */

type RatingKey = 'high' | 'medium' | 'low' | 'none';

function ratingKey(value: string): RatingKey {
  const v = value.toLowerCase();
  if (/med|moder/.test(v)) return 'medium';
  if (/crit|high|major|severe/.test(v)) return 'high';
  if (/low|minor/.test(v)) return 'low';
  return 'none';
}

const RATING_STYLE: Record<
  RatingKey,
  { fill: string; ink: string; label: string; mermaid: string }
> = {
  high: { fill: C.red, ink: C.redInk, label: 'High', mermaid: 'high' },
  medium: {
    fill: C.amber,
    ink: C.amberInk,
    label: 'Medium',
    mermaid: 'medium',
  },
  low: { fill: C.green, ink: C.greenInk, label: 'Low', mermaid: 'low' },
  none: { fill: C.grey, ink: C.greyInk, label: 'Not rated', mermaid: 'none' },
};

function ratingCell(value: string): Cell {
  const style = RATING_STYLE[ratingKey(value)];
  return {
    t: value || 'Not rated',
    fill: style.fill,
    color: style.ink,
    bold: true,
    align: AlignmentType.CENTER,
  };
}

function splitRoles(value: string): string[] {
  return value
    .split(/[/,;&]| and /i)
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part !== '—');
}

function canonicalRoles(steps: ProcessStep[]): Map<string, string> {
  const map = new Map<string, string>();
  const fields: (keyof ProcessStep)[] = [
    'Responsible',
    'Accountable',
    'Consulted',
    'Informed',
    'Verification (VI)',
    'Signatory (SI)',
  ];
  for (const step of steps) {
    for (const field of fields) {
      for (const role of splitRoles(String(step[field] ?? ''))) {
        const key = role.toLowerCase();
        if (!map.has(key)) map.set(key, role);
      }
    }
  }
  return map;
}

function bar(percent: number, color: string, width = 24): TextRun[] {
  const filled = Math.max(
    percent > 0 ? 1 : 0,
    Math.round((percent / 100) * width),
  );
  return [
    run('█'.repeat(filled), { color, size: 18 }),
    run('░'.repeat(Math.max(width - filled, 0)), { color: C.line, size: 18 }),
  ];
}

function barCell(
  width: number,
  percent: number,
  color: string,
  fill: string,
): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    borders: allBorders,
    shading: { type: ShadingType.CLEAR, fill, color: 'auto' },
    children: [
      new Paragraph({
        spacing: { before: 0, after: 0 },
        children: [
          ...bar(percent, color, 26),
          run(`  ${percent}%`, { size: 17, color: C.muted }),
        ],
      }),
    ],
  });
}

function barTable(
  headers: [string, string, string],
  rows: { label: Cell; value: string; percent: number; color: string }[],
): Table {
  const widths = [Math.floor(PAGE_W * 0.3), Math.floor(PAGE_W * 0.12), 0];
  widths[2] = PAGE_W - widths[0] - widths[1];
  return new Table({
    width: { size: PAGE_W, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((head, i) =>
          mk(
            { t: head, fill: C.brand, color: C.white, bold: true },
            widths[i],
            { size: 18 },
          ),
        ),
      }),
      ...rows.map((row, index) => {
        const fill = index % 2 ? C.zebra : C.white;
        return new TableRow({
          cantSplit: true,
          children: [
            mk(row.label, widths[0], { size: 18, fill }),
            mk(
              { t: row.value, align: AlignmentType.CENTER, bold: true },
              widths[1],
              { size: 18, fill },
            ),
            barCell(widths[2], row.percent, row.color, fill),
          ],
        });
      }),
    ],
  });
}

/* ------------------------------------------------------------------ */
/* Swimlane and flow                                                   */
/* ------------------------------------------------------------------ */

function codeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function shortLabel(value: string, words = 6): string {
  const parts = value.split(/\s+/).filter(Boolean);
  return parts.length > words ? `${parts.slice(0, words).join(' ')}…` : value;
}

function stepLabels(bundle: PipelineBundle): Map<string, string> {
  const labels = new Map<string, string>();
  for (const node of asList(bundle.swimlane?.nodes)) {
    const code = codeKey(str(node.code) || str(node.id));
    const label = str(node.label);
    if (code && label) labels.set(code, label);
  }
  return labels;
}

function laneOrder(steps: ProcessStep[]): string[] {
  const roles = canonicalRoles(steps);
  const ordered: string[] = [];
  const add = (name: string) => {
    const canonical = roles.get(name.toLowerCase()) ?? name;
    if (
      name &&
      !ordered.some((lane) => lane.toLowerCase() === canonical.toLowerCase())
    )
      ordered.push(canonical);
  };
  for (const step of steps) {
    const lanes = splitRoles(step.Responsible);
    if (lanes.length === 0) add('Unassigned');
    lanes.forEach(add);
  }
  return ordered;
}

function decisionsAfter(
  bundle: PipelineBundle,
): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const decision of asList(bundle.findings?.decision_points)) {
    const key = codeKey(str(decision.after_step));
    if (key) map.set(key, decision);
  }
  return map;
}

const SWIM_COLUMNS = 5;

function swimlaneTables(bundle: PipelineBundle): Block[] {
  const steps = bundle.process;
  const lanes = laneOrder(steps);
  const labels = stepLabels(bundle);
  const out: Block[] = [];
  const laneWidth = 1700;
  const stepWidth = Math.floor((PAGE_W - laneWidth) / SWIM_COLUMNS);

  for (let start = 0; start < steps.length; start += SWIM_COLUMNS) {
    const chunk = steps.slice(start, start + SWIM_COLUMNS);
    const widths = [laneWidth, ...chunk.map(() => stepWidth)];
    const header = new TableRow({
      tableHeader: true,
      cantSplit: true,
      children: [
        mk(
          { t: 'Role', fill: C.brandDark, color: C.white, bold: true },
          laneWidth,
          { size: 18 },
        ),
        ...chunk.map((step, i) =>
          mk(
            {
              t: `Step ${step.SLN}\n${sc(step.Code)}`,
              fill: C.brand,
              color: C.white,
              bold: true,
              align: AlignmentType.CENTER,
              size: 16,
            },
            widths[i + 1],
            { size: 16 },
          ),
        ),
      ],
    });
    const rows = lanes.map((lane) => {
      return new TableRow({
        cantSplit: true,
        height: { value: 760, rule: 'atLeast' as const },
        children: [
          mk(
            { t: lane, fill: C.brandTint, bold: true, color: C.brandDark },
            laneWidth,
            { size: 17 },
          ),
          ...chunk.map((step, i) => {
            const stepLanes = splitRoles(step.Responsible);
            const effective = stepLanes.length ? stepLanes : ['Unassigned'];
            const inLane = effective.some(
              (name) => name.toLowerCase() === lane.toLowerCase(),
            );
            if (!inLane)
              return mk({ t: '', blank: true, fill: 'FBFBFC' }, widths[i + 1], {
                size: 14,
              });
            const style = RATING_STYLE[ratingKey(step['Risk Rating'])];
            const next = steps[start + i + 1];
            let arrow = '';
            if (next) {
              const nextLane = laneOrder([next])[0] ?? '';
              const nextIdx = lanes.findIndex(
                (l) => l.toLowerCase() === nextLane.toLowerCase(),
              );
              const thisIdx = lanes.findIndex(
                (l) => l.toLowerCase() === lane.toLowerCase(),
              );
              arrow =
                nextIdx === thisIdx ? '→' : nextIdx > thisIdx ? '↘' : '↗';
            }
            const label =
              labels.get(codeKey(step.Code)) || shortLabel(step.Name);
            return mk(
              {
                t: `${label}${arrow ? `  ${arrow}` : ''}`,
                fill: style.fill,
                color: C.ink,
                size: 16,
              },
              widths[i + 1],
              { size: 16 },
            );
          }),
        ],
      });
    });
    out.push(
      new Table({
        width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
        columnWidths: widths,
        layout: TableLayoutType.FIXED,
        rows: [header, ...rows],
      }),
      spacer(240),
    );
  }
  return out;
}

/** A decision diamond takes about as much room as two and a half steps. */
const FLOW_MAX_WEIGHT = 9;
const FLOW_DECISION_WEIGHT = 1.6;

function flowChunkBounds(
  bundle: PipelineBundle,
): { start: number; size: number }[] {
  const decisions = decisionsAfter(bundle);
  const out: { start: number; size: number }[] = [];
  let start = 0;
  let weight = 0;
  bundle.process.forEach((step, index) => {
    const w =
      1 + (decisions.has(codeKey(step.Code)) ? FLOW_DECISION_WEIGHT : 0);
    if (index > start && weight + w > FLOW_MAX_WEIGHT) {
      out.push({ start, size: index - start });
      start = index;
      weight = 0;
    }
    weight += w;
  });
  if (bundle.process.length > start)
    out.push({ start, size: bundle.process.length - start });
  return out;
}

function mermaidFlowChunk(
  bundle: PipelineBundle,
  start: number,
  size: number,
  withDecisions = true,
): string {
  const steps = bundle.process;
  const chunk = steps.slice(start, start + size);
  const labels = stepLabels(bundle);
  const decisions = withDecisions
    ? decisionsAfter(bundle)
    : new Map<string, Record<string, unknown>>();
  const clean = (value: string) =>
    value
      .replace(/["<>{}()[\]|#;]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const id = (step: ProcessStep) => `S${step.SLN}`;
  const out: string[] = [
    'flowchart TD',
    '  classDef high fill:#F8D7DA,stroke:#9B1C1C,color:#1F2937,stroke-width:1.5px',
    '  classDef medium fill:#FFF1CC,stroke:#C28A00,color:#1F2937,stroke-width:1.5px',
    '  classDef low fill:#D9F2E1,stroke:#2E8B57,color:#1F2937,stroke-width:1.5px',
    '  classDef none fill:#EEF0F3,stroke:#9CA3AF,color:#1F2937,stroke-width:1.5px',
    '  classDef decision fill:#F8ECEF,stroke:#8B1E3F,color:#5E1329,stroke-width:2px',
    '  classDef stub fill:#FFFFFF,stroke:#9CA3AF,color:#6B7280,stroke-dasharray:4 3',
  ];
  if (start > 0) {
    out.push(`  Cin(["From step ${start}"]):::stub`);
    out.push(`  Cin --> ${id(chunk[0])}`);
  }
  chunk.forEach((step, index) => {
    const label = clean(
      labels.get(codeKey(step.Code)) || shortLabel(step.Name, 7),
    );
    const role = clean(step.Responsible);
    out.push(
      `  ${id(step)}["<b>${step.SLN}</b> · ${label}${role ? `<br/><i>${role}</i>` : ''}"]:::${RATING_STYLE[ratingKey(step['Risk Rating'])].mermaid}`,
    );
    const next = chunk[index + 1];
    const decision = decisions.get(codeKey(step.Code));
    if (decision && next) {
      const did = `D${step.SLN}`;
      out.push(
        `  ${did}{"${clean(str(decision.question)) || 'Decision'}"}:::decision`,
      );
      out.push(`  ${id(step)} --> ${did}`);
      const find = (target: string) =>
        chunk.find((s) => target && codeKey(target).includes(codeKey(s.Code)));
      const yes = find(str(decision.yes_goes_to));
      const no = find(str(decision.no_goes_to));
      if (yes || no) {
        out.push(`  ${did} -->|Yes| ${id(yes ?? next)}`);
        out.push(`  ${did} -->|No| ${id(no ?? next)}`);
      } else {
        out.push(`  ${did} --> ${id(next)}`);
      }
    } else if (next) {
      out.push(`  ${id(step)} --> ${id(next)}`);
    }
  });
  const last = chunk[chunk.length - 1];
  if (start + size < steps.length) {
    out.push(`  Cout(["Continues at step ${last.SLN + 1}"]):::stub`);
    out.push(`  ${id(last)} --> Cout`);
  } else {
    out.push('  End(["End"]):::stub');
    out.push(`  ${id(last)} --> End`);
  }
  return out.join('\n');
}

function pngSize(data: Buffer): { width: number; height: number } | null {
  if (data.length < 24 || data.toString('ascii', 1, 4) !== 'PNG') return null;
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

type FlowImage = { data: Buffer; width: number; height: number };
/** One chunk of the end-to-end flow: a picture, or (when no picture could be made) a native table. */
type FlowPiece = { image: FlowImage | null; start: number; size: number };

/** A picture is only accepted when it is tall enough to hold every step of its chunk. */
function flowImageLooksComplete(png: Buffer, steps: number): boolean {
  const dim = pngSize(png);
  return Boolean(dim && dim.width >= 200 && dim.height >= steps * 70);
}

async function renderFlowChunk(
  bundle: PipelineBundle,
  start: number,
  size: number,
): Promise<Buffer | null> {
  const steps = Math.min(size, bundle.process.length - start);
  // Test switch: behave as if no renderer is available (exercises the table fallback).
  if (process.env.BPM_FLOW_DISABLE_RENDER === '1') return null;
  for (const withDecisions of [true, false]) {
    const png = await renderMermaidPngBest(
      mermaidFlowChunk(bundle, start, size, withDecisions),
    ).catch((): Buffer | null => null);
    if (png && flowImageLooksComplete(png, steps)) return png;
    console.warn(
      `[word-export] flow chunk at step ${start + 1} incomplete (decisions=${withDecisions})`,
    );
  }
  return null;
}

async function fetchFlowImages(bundle: PipelineBundle): Promise<FlowPiece[]> {
  const bounds = flowChunkBounds(bundle);
  const pieces: FlowPiece[] = [];
  for (let i = 0; i < bounds.length; i += 2) {
    const batch = bounds.slice(i, i + 2);
    const rendered = await Promise.all(
      batch.map((chunk) => renderFlowChunk(bundle, chunk.start, chunk.size)),
    );
    batch.forEach((chunk, index) => {
      const png = rendered[index];
      let image: FlowImage | null = null;
      if (png) {
        const dim = pngSize(png);
        const scale = dim ? Math.min(620 / dim.width, 720 / dim.height, 1) : 1;
        image = dim
          ? {
              data: png,
              width: Math.round(dim.width * scale),
              height: Math.round(dim.height * scale),
            }
          : { data: png, width: 520, height: 520 };
      }
      pieces.push({ image, start: chunk.start, size: chunk.size });
    });
  }
  return pieces;
}

/** Readable table version of one flow chunk. Used when a picture cannot be produced, so no step is ever missing. */
function nativeFlowTable(
  bundle: PipelineBundle,
  start: number,
  size: number,
): Block[] {
  const steps = bundle.process.slice(start, start + size);
  const decisions = decisionsAfter(bundle);
  const labels = stepLabels(bundle);
  const rows: Cell[][] = steps.map((step, index) => {
    const next = bundle.process[start + index + 1];
    const decision = decisions.get(codeKey(step.Code));
    let after = next ? `Go to step ${next.SLN}` : 'End of process';
    if (decision) {
      const question = str(decision.question) || 'Decision';
      const yes = str(decision.yes_goes_to);
      const no = str(decision.no_goes_to);
      after = `${question}\nYes: ${yes || (next ? `step ${next.SLN}` : 'end')}\nNo: ${no || (next ? `step ${next.SLN}` : 'end')}`;
    }
    return [
      { t: String(step.SLN), bold: true, align: AlignmentType.CENTER },
      step.Code,
      { t: labels.get(codeKey(step.Code)) || step.Name, bold: true },
      step.Responsible || '—',
      after,
    ];
  });
  return [
    table(
      ['#', 'Code', 'Step', 'Responsible', 'Then'],
      rows,
      [0.5, 1.9, 3.4, 2.0, 2.7],
      17,
    ),
  ];
}

function flowBlocks(bundle: PipelineBundle, pieces: FlowPiece[]): Block[] {
  const out: Block[] = [];
  for (const piece of pieces) {
    if (piece.image) {
      out.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 120, after: 160 },
          keepNext: false,
          children: [
            new ImageRun({
              type: 'png',
              data: piece.image.data,
              transformation: {
                width: piece.image.width,
                height: piece.image.height,
              },
            }),
          ],
        }),
      );
    } else {
      out.push(...nativeFlowTable(bundle, piece.start, piece.size));
      out.push(spacer(120));
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* RACI                                                                */
/* ------------------------------------------------------------------ */

const RACI_STYLE: Record<string, { fill: string; ink: string }> = {
  R: { fill: C.red, ink: C.redInk },
  A: { fill: C.blue, ink: C.blueInk },
  C: { fill: C.amber, ink: C.amberInk },
  I: { fill: C.grey, ink: C.greyInk },
  V: { fill: C.green, ink: C.greenInk },
  S: { fill: C.purple, ink: C.purpleInk },
};

const RACI_COLS = 6;

function raciTables(bundle: PipelineBundle): Block[] {
  const roleMap = canonicalRoles(bundle.process);
  const sourceFields: [string, keyof ProcessStep][] = [
    ['R', 'Responsible'],
    ['A', 'Accountable'],
    ['C', 'Consulted'],
    ['I', 'Informed'],
    ['V', 'Verification (VI)'],
    ['S', 'Signatory (SI)'],
  ];
  const involvement = new Map<string, number>();
  const letters = bundle.process.map((step) => {
    const row = new Map<string, string[]>();
    for (const [letter, field] of sourceFields) {
      for (const role of splitRoles(String(step[field] ?? ''))) {
        const key = role.toLowerCase();
        const list = row.get(key) ?? [];
        if (!list.includes(letter)) list.push(letter);
        row.set(key, list);
        involvement.set(key, (involvement.get(key) ?? 0) + 1);
      }
    }
    return row;
  });
  const roles = [...roleMap.keys()].sort(
    (a, b) => (involvement.get(b) ?? 0) - (involvement.get(a) ?? 0),
  );
  if (roles.length === 0) return [p('—', { color: C.muted })];

  const blocks: Block[] = [];
  for (let from = 0; from < roles.length; from += RACI_COLS) {
    const group = roles.slice(from, from + RACI_COLS);
    const codeW = 1500;
    const nameW = 2300;
    const roleW = Math.floor((PAGE_W - codeW - nameW) / RACI_COLS);
    const widths = [codeW, nameW, ...group.map(() => roleW)];
    const head = new TableRow({
      tableHeader: true,
      cantSplit: true,
      children: [
        mk({ t: 'Step', fill: C.brand, color: C.white, bold: true }, codeW, {
          size: 16,
        }),
        mk(
          { t: 'Activity', fill: C.brand, color: C.white, bold: true },
          nameW,
          { size: 16 },
        ),
        ...group.map((role, i) =>
          mk(
            {
              t: roleMap.get(role) ?? role,
              fill: C.brand,
              color: C.white,
              bold: true,
              align: AlignmentType.CENTER,
              size: 15,
            },
            widths[i + 2],
            { size: 15 },
          ),
        ),
      ],
    });
    const rows = bundle.process.map((step, index) => {
      const zebra = index % 2 ? C.zebra : C.white;
      return new TableRow({
        cantSplit: true,
        children: [
          mk({ t: sc(step.Code), fill: zebra, bold: true }, codeW, {
            size: 15,
          }),
          mk({ t: shortLabel(step.Name, 7), fill: zebra }, nameW, { size: 15 }),
          ...group.map((role, i) => {
            const set = letters[index].get(role) ?? [];
            if (!set.length)
              return mk({ t: '', blank: true, fill: zebra }, widths[i + 2], {
                size: 15,
              });
            const primary =
              (['R', 'A', 'V', 'S', 'C', 'I'] as const).find((l) =>
                set.includes(l),
              ) ?? 'I';
            const style = RACI_STYLE[primary];
            return mk(
              {
                t: set.join('/'),
                fill: style.fill,
                color: style.ink,
                bold: true,
                align: AlignmentType.CENTER,
                size: 16,
              },
              widths[i + 2],
              { size: 16 },
            );
          }),
        ],
      });
    });
    blocks.push(
      new Table({
        width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
        columnWidths: widths,
        layout: TableLayoutType.FIXED,
        rows: [head, ...rows],
      }),
      spacer(240),
    );
  }
  return blocks;
}

/* ------------------------------------------------------------------ */
/* Policies and integrated sub-processes                               */
/* ------------------------------------------------------------------ */

const POLICY_INK = '0F172A';
const POLICY_BODY = '334155';
const POLICY_MUTED = '64748B';

function richParagraphs(html: string, fallbackPlain: string): Block[] {
  const blocks = htmlToRichBlocks(html);
  if (!blocks.length) {
    const plain = fallbackPlain.trim();
    return [
      p(plain || 'No topic content', {
        size: 20,
        color: plain ? POLICY_BODY : '94A3B8',
        italics: !plain,
        indent: 280,
        barColor: C.policyBorder,
        before: 40,
        after: 60,
      }),
    ];
  }
  return blocks.map((block) => {
    const children: ParagraphChild[] = block.runs.map(
      (item) =>
        new TextRun({
          text: item.text,
          font: 'Calibri',
          size: 20,
          color: POLICY_BODY,
          bold: item.bold,
          italics: item.italics,
          underline: item.underline ? {} : undefined,
        }),
    );
    if (block.kind === 'bullet')
      children.unshift(
        new TextRun({
          text: '•  ',
          font: 'Calibri',
          size: 20,
          color: POLICY_BODY,
        }),
      );
    if (block.kind === 'number') {
      children.unshift(
        new TextRun({
          text: `${block.number}.  `,
          font: 'Calibri',
          size: 20,
          color: POLICY_BODY,
          bold: true,
        }),
      );
    }
    return new Paragraph({
      spacing: { before: 30, after: 70, line: 276 },
      indent: {
        left: block.kind === 'p' ? 280 : 560,
        hanging: block.kind === 'p' ? 0 : 240,
      },
      border:
        block.kind === 'p'
          ? {
              left: {
                style: BorderStyle.SINGLE,
                size: 12,
                color: C.policyBorder,
                space: 8,
              },
            }
          : undefined,
      children,
    });
  });
}

function policyHeading(number: number, title: string): Paragraph {
  return new Paragraph({
    spacing: { before: 240, after: 80 },
    keepNext: true,
    children: [
      run(`${number}.  `, { bold: true, size: 24, color: C.policyAccent }),
      run(title, { bold: true, size: 24, color: POLICY_INK }),
    ],
  });
}

function policyLabel(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 120, after: 60 },
    keepNext: true,
    children: [
      run(text.toUpperCase(), { bold: true, size: 17, color: POLICY_INK }),
    ],
  });
}

/** Policy Creator document view: header, contents, document control, numbered topics with business rules. */
function policyCard(policy: WordPolicyDocument): Block[] {
  const out: Block[] = [];
  const edge = { style: BorderStyle.SINGLE, size: 8, color: C.policyBorder };
  const softBorders = { top: edge, bottom: edge, left: edge, right: edge };
  const meta = policy.documentMeta;
  const version = policy.version != null ? `v${policy.version}.0` : '—';

  out.push(
    new Paragraph({
      spacing: { before: 280, after: 80 },
      keepNext: true,
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 12, color: C.policyAccent },
      },
      children: [
        run('RELATED POLICY', { bold: true, size: 18, color: C.policyAccent }),
      ],
    }),
    p(policy.name, {
      bold: true,
      size: 28,
      color: POLICY_INK,
      before: 120,
      after: 40,
      keepNext: true,
    }),
  );
  if (meta?.documentCode)
    out.push(
      p(meta.documentCode, {
        size: 17,
        color: POLICY_MUTED,
        before: 0,
        after: 120,
        keepNext: true,
      }),
    );

  out.push(
    table(
      ['Field', 'Value'],
      [
        [{ t: 'Company', bold: true }, policy.companyName || '—'],
        [{ t: 'Department', bold: true }, policy.departmentName || '—'],
        ...(meta?.visibility
          ? [[{ t: 'Visibility', bold: true }, meta.visibility] as Cell[]]
          : []),
        [{ t: 'Document Version', bold: true }, version],
      ],
      [1, 3],
    ),
  );

  if (policy.businessRole?.trim()) {
    const ruleLines = policy.businessRole.replace(/\r\n/g, '\n').split('\n');
    out.push(
      spacer(80),
      new Table({
        width: { size: PAGE_W, type: WidthType.DXA },
        columnWidths: [PAGE_W],
        layout: TableLayoutType.FIXED,
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: PAGE_W, type: WidthType.DXA },
                borders: softBorders,
                shading: {
                  fill: C.policyFill,
                  type: ShadingType.CLEAR,
                  color: 'auto',
                },
                margins: { top: 120, bottom: 120, left: 160, right: 160 },
                children: [
                  new Paragraph({
                    spacing: { after: 80 },
                    children: [
                      run('Business Rule', {
                        bold: true,
                        size: 20,
                        color: POLICY_INK,
                      }),
                    ],
                  }),
                  ...ruleLines.map(
                    (line) =>
                      new Paragraph({
                        spacing: { after: line.trim() ? 60 : 80 },
                        children: [run(line, { size: 20, color: POLICY_BODY })],
                      }),
                  ),
                ],
              }),
            ],
          }),
        ],
      }),
    );
  }

  if (policy.sections.length) {
    out.push(policyHeading(1, 'Table of Contents'));
    out.push(
      table(
        ['No.', 'Contents'],
        [
          ['1', 'Table of Contents'],
          ['2', 'Document Control'],
          ...policy.sections.map((section, index) => [
            String(index + 3),
            section.title,
          ]),
        ],
        [0.7, 9.3],
        18,
      ),
    );
  }

  if (meta) {
    out.push(policyHeading(2, 'Document Control'));
    out.push(kv([['Document name', policy.name]]));
    out.push(policyLabel('Authorisation'));
    out.push(
      table(
        ['Role', 'Name', 'Title', 'Signature'],
        meta.authorisers.map((item) => [
          item.label,
          { t: item.name, bold: true },
          item.role,
          item.signature || '—',
        ]),
        [3, 2.6, 2.4, 2],
        18,
      ),
    );
    out.push(
      p(
        [
          run('Distribution list: ', {
            bold: true,
            size: 20,
            color: POLICY_BODY,
          }),
          run(meta.distributionList, { size: 20, color: POLICY_BODY }),
        ],
        {
          before: 120,
          after: 60,
        },
      ),
    );
    out.push(policyLabel('Version history'));
    out.push(
      table(
        ['Version', 'Date', 'Approved By', 'Changes & Reason for Change'],
        meta.versionHistory.map((row) => [
          row.version,
          row.date,
          row.approvedBy,
          row.reason,
        ]),
        [1.4, 2, 2.6, 4],
        18,
      ),
    );
    if (meta.effectiveDate)
      out.push(
        p(`Effective date: ${meta.effectiveDate}`, {
          size: 16,
          color: POLICY_MUTED,
          before: 80,
          after: 60,
        }),
      );
  }

  if (policy.processLabel) {
    out.push(
      p(
        [
          run('Linked process: ', { bold: true, size: 20, color: POLICY_BODY }),
          run(policy.processLabel, { size: 20, color: POLICY_BODY }),
        ],
        { before: 120, after: 60 },
      ),
    );
  }

  policy.sections.forEach((section, index) => {
    const number = index + 3;
    out.push(policyHeading(number, section.title));
    out.push(...richParagraphs(section.contentHtml, section.contentPlain));
    out.push(policyLabel('Business Rules'));
    if (section.businessRules.length) {
      section.businessRules.forEach((rule, ruleIndex) => {
        out.push(
          new Paragraph({
            spacing: { before: 30, after: 70, line: 276 },
            indent: { left: 1000, hanging: 620 },
            tabStops: [{ type: TabStopType.LEFT, position: 1000 }],
            border: {
              left: {
                style: BorderStyle.SINGLE,
                size: 12,
                color: C.policyBorder,
                space: 8,
              },
            },
            children: [
              run(`${number}.${ruleIndex + 1}`, {
                bold: true,
                size: 20,
                color: POLICY_INK,
              }),
              new TextRun({ text: '\t', font: 'Calibri', size: 20 }),
              run(rule, { size: 20, color: POLICY_BODY }),
            ],
          }),
        );
      });
    } else {
      out.push(
        p('No business rules added', {
          size: 19,
          color: '94A3B8',
          italics: true,
          indent: 280,
          before: 20,
          after: 60,
        }),
      );
    }
  });

  out.push(
    new Paragraph({
      spacing: { before: 200, after: 200 },
      border: {
        top: { style: BorderStyle.SINGLE, size: 6, color: C.policyBorder },
      },
      alignment: AlignmentType.CENTER,
      children: [
        run(
          `Confidential · Internal use only · © NEWEAST${policy.version != null ? ` · Version ${policy.version}.0` : ''}`,
          {
            italics: true,
            size: 16,
            color: '94A3B8',
          },
        ),
      ],
    }),
  );
  return out;
}

function integratedBlocks(
  links: RelatedSubProcessWordLink[],
  inDocument: Set<string>,
): Block[] {
  if (!links.length) return [];
  const out: Block[] = [h3('Integrated sub-process')];
  for (const link of links) {
    const label =
      [link.code, link.activityName].filter(Boolean).join(' — ') || link.id;
    const text = new TextRun({
      text: label,
      font: 'Calibri',
      size: 20,
      bold: true,
      color: '0563C1',
      underline: {},
    });
    const anchor = subProcessBookmarkId(link.code);
    const child: ParagraphChild = inDocument.has(anchor)
      ? new InternalHyperlink({ anchor, children: [text] })
      : link.bpmUrl
        ? new ExternalHyperlink({ link: link.bpmUrl, children: [text] })
        : text;
    out.push(p([child], { bullet: true }));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Process document body                                               */
/* ------------------------------------------------------------------ */

function hasRiskContent(s: ProcessStep): boolean {
  return Boolean(
    s.Risks ||
      s['Risk IDs'] ||
      s['Risk Titles'] ||
      s['Risk Descriptions'] ||
      s['Internal Audit Risk'] ||
      s['Control IDs'] ||
      s['Control Titles'] ||
      s['Control Mitigation'],
  );
}

function hasRatings(bundle: PipelineBundle): boolean {
  return bundle.process.some((s) => ratingKey(s['Risk Rating']) !== 'none');
}

function riskRegisterRows(bundle: PipelineBundle): ProcessStep[] {
  return bundle.process.filter(
    (s) => hasRiskContent(s) || ratingKey(s['Risk Rating']) !== 'none',
  );
}

function riskRegister(bundle: PipelineBundle): Block[] {
  const rows: Cell[][] = riskRegisterRows(bundle).map((s) => [
    { t: `${sc(s.Code)}\n${shortLabel(s.Name, 5)}`, bold: true },
    [
      s['Risk IDs'],
      s.Risks,
      s['Risk Titles'],
      s['Risk Descriptions'],
      s['Risk Owner Title'],
      s['Internal Audit Risk'],
    ]
      .filter(Boolean)
      .join('\n') || '—',
    ratingCell(s['Risk Rating']),
    [s['Control IDs'], s['Control Titles'], s['Control Mitigation']]
      .filter(Boolean)
      .join('\n') || '—',
  ]);
  const withRating = hasRatings(bundle);
  return [
    withRating
      ? table(
          ['Step', 'Risk', 'Rating', 'Control and mitigation'],
          rows,
          [2.2, 5, 1.2, 3.6],
          17,
        )
      : table(
          ['Step', 'Risk', 'Control and mitigation'],
          rows.map((r) => [r[0], r[1], r[3]]),
          [2.4, 5.2, 4.4],
          17,
        ),
  ];
}

function fieldsTable(fields: { label: string; value: string }[]): Table {
  const left = 3000;
  const right = PAGE_W - left;
  return new Table({
    width: { size: PAGE_W, type: WidthType.DXA },
    columnWidths: [left, right],
    layout: TableLayoutType.FIXED,
    rows: fields.map(
      (field, index) =>
        new TableRow({
          cantSplit: true,
          children: [
            mk(
              {
                t: field.label,
                fill: C.brandTint,
                bold: true,
                color: C.brandDark,
              },
              left,
              { size: 17 },
            ),
            /rating/i.test(field.label) && /risk/i.test(field.label)
              ? mk(ratingCell(field.value), right, { size: 18 })
              : mk(field.value || '—', right, {
                  size: 18,
                  fill: index % 2 ? C.zebra : C.white,
                }),
          ],
        }),
    ),
  });
}

function stepCard(
  bundle: PipelineBundle,
  step: ProcessStep,
  index: number,
  inDocument: Set<string>,
): Block[] {
  const narrative = asRecord(bundle.narratives[index]);
  const style = RATING_STYLE[ratingKey(step['Risk Rating'])];
  const anchor = subProcessBookmarkId(step.Code);
  const out: Block[] = [];
  out.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      keepNext: true,
      spacing: { before: 300, after: 80 },
      shading: { type: ShadingType.CLEAR, fill: C.brandTint, color: 'auto' },
      border: {
        left: {
          style: BorderStyle.SINGLE,
          size: 36,
          color: style.ink,
          space: 8,
        },
      },
      indent: { left: 120 },
      children: [
        new Bookmark({
          id: anchor,
          children: [
            run(`${step.SLN}.  `, { size: 26, bold: true, color: C.brand }),
            run(`${step.Code}  `, { size: 22, bold: true, color: C.muted }),
            run(step.Name || 'Unnamed step', {
              size: 26,
              bold: true,
              color: C.brandDark,
            }),
          ],
        }),
      ],
    }),
  );
  if (str(narrative.purpose))
    out.push(labelled('Purpose', str(narrative.purpose)));
  if (str(narrative.how_it_works))
    out.push(
      labelled(
        'How it works',
        str(narrative.how_it_works),
        C.blueInk,
        'EEF4FB',
      ),
    );
  if (str(narrative.control_rationale))
    out.push(
      labelled(
        'Control',
        str(narrative.control_rationale),
        C.greenInk,
        'EEF9F2',
      ),
    );
  if (str(narrative.watch_out))
    out.push(
      labelled('Watch out', str(narrative.watch_out), C.amberInk, 'FFF8E6'),
    );
  out.push(spacer(60));

  const fields = bundle.fields[index]?.length
    ? bundle.fields[index]
    : [
        { label: 'Activity Name', value: step.Name },
        { label: 'Activity Description', value: step.Description },
      ];
  out.push(fieldsTable(fields));
  out.push(...integratedBlocks(bundle.integrated[index] ?? [], inDocument));
  for (const policy of bundle.policies[index] ?? [])
    out.push(...policyCard(policy));
  return out;
}

function ratingBars(bundle: PipelineBundle): Block[] {
  const total = bundle.stats.step_count || 1;
  const barColor: Record<RatingKey, string> = {
    high: C.redInk,
    medium: 'D9A400',
    low: '3E9B5F',
    none: '9CA3AF',
  };
  const rows = (['high', 'medium', 'low', 'none'] as RatingKey[]).map((key) => {
    const count = Object.entries(bundle.stats.rating_counts)
      .filter(([name]) =>
        name === 'Not set' ? key === 'none' : ratingKey(name) === key,
      )
      .reduce((sum, [, n]) => sum + n, 0);
    return {
      label: {
        t: `${RATING_STYLE[key].label}`,
        fill: RATING_STYLE[key].fill,
        color: RATING_STYLE[key].ink,
        bold: true,
      } as Cell,
      value: String(count),
      percent: Math.round((count / total) * 100),
      color: barColor[key],
    };
  });
  return [barTable(['Risk rating', 'Steps', 'Distribution'], rows)];
}

function overviewBlocks(bundle: PipelineBundle): Block[] {
  const o = asRecord(bundle.overview);
  const out: Block[] = [];
  const rows = (
    [
      ['Objective', str(o.objective)],
      ['Trigger', str(o.trigger)],
      ['Outcome', str(o.outcome)],
      ['Scope', str(o.scope)],
      ['Systems', asStrings(o.systems).join(', ')],
      ['Policies and standards', asStrings(o.policies).join(', ')],
    ] as [string, string][]
  ).filter(([, value]) => value);
  if (rows.length) out.push(kv(rows));
  const phases = asList(o.phases);
  if (phases.length) {
    out.push(h2('Process phases'));
    out.push(
      table(
        ['#', 'Phase', 'Steps', 'What happens'],
        phases.map((phase, i) => [
          {
            t: String(i + 1),
            bold: true,
            align: AlignmentType.CENTER,
            fill: C.brandTint,
            color: C.brand,
          },
          { t: str(phase.name), bold: true },
          sc(phase.steps),
          str(phase.summary),
        ]),
        [0.6, 2.6, 2.4, 5],
      ),
    );
  }
  return out;
}

function executiveBlocks(bundle: PipelineBundle): Block[] {
  const exec = asRecord(bundle.executive);
  const out: Block[] = [];
  if (str(exec.purpose)) {
    out.push(
      p(str(exec.purpose), {
        size: 23,
        fill: C.brandTint,
        barColor: C.brand,
        indent: 200,
        before: 80,
        after: 120,
      }),
    );
  }
  const facts = asStrings(exec.key_facts);
  if (facts.length) {
    out.push(h3('Key facts'));
    facts.forEach((fact) => out.push(p(fact, { bullet: true, size: 20 })));
  }
  return out;
}

function definedGlossaryTerms(bundle: PipelineBundle) {
  return (bundle.glossary?.terms ?? []).filter(
    (term) =>
      term.definition &&
      !/not provided in (?:the )?(?:BPM|source) data/i.test(term.definition),
  );
}

function glossaryBlocks(bundle: PipelineBundle, onlyDefined = false): Block[] {
  const terms = (
    onlyDefined ? definedGlossaryTerms(bundle) : (bundle.glossary?.terms ?? [])
  )
    .slice()
    .sort((a, b) => a.term.localeCompare(b.term));
  return [
    table(
      ['Term', 'Definition'],
      terms.map((term) => [
        { t: term.term, bold: true, color: C.brandDark },
        term.definition,
      ]),
      [2.2, 7.8],
    ),
  ];
}

type ProcessImages = Map<PipelineBundle, FlowPiece[]>;

function processBlocks(
  bundle: PipelineBundle,
  images: FlowPiece[],
  inDocument: Set<string>,
  firstSection: boolean,
): Block[] {
  const steps = bundle.process;
  const roleCount = bundle.stats.role_shares.length;
  const high = Object.entries(bundle.stats.rating_counts)
    .filter(([name]) => ratingKey(name) === 'high')
    .reduce((sum, [, n]) => sum + n, 0);
  const out: Block[] = [];
  const showRisk = hasRatings(bundle) || riskRegisterRows(bundle).length > 0;
  const showRatings = hasRatings(bundle);
  const hasRoles = canonicalRoles(steps).size > 0;

  out.push(h1('Executive Summary', { pageBreak: firstSection }));
  out.push(
    statCards([
      { value: String(steps.length), label: 'Process steps' },
      ...(hasRoles
        ? [{ value: String(roleCount), label: 'Roles involved' }]
        : []),
      ...(showRisk
        ? [
            {
              value: String(bundle.stats.distinct_control_ids),
              label: 'Distinct controls',
              tone: 'green' as const,
            },
            {
              value: String(high),
              label: 'High-risk steps',
              tone: high ? ('red' as const) : ('green' as const),
            },
          ]
        : [
            {
              value: String(
                bundle.policies.reduce((n, list) => n + list.length, 0),
              ),
              label: 'Linked policies',
            },
            {
              value: String(
                bundle.integrated.reduce((n, list) => n + list.length, 0),
              ),
              label: 'Integrated sub-processes',
            },
          ]),
    ]),
  );
  out.push(spacer(80));
  out.push(...executiveBlocks(bundle));

  out.push(h1('Process Overview', { pageBreak: true }));
  out.push(...overviewBlocks(bundle));
  if (showRatings) {
    out.push(h2('Risk profile'));
    out.push(...ratingBars(bundle));
  }
  if (hasRoles) out.push(h2('Workload by role'));
  if (hasRoles)
    out.push(
      barTable(
        ['Role', 'Steps', 'Share of workload'],
        bundle.stats.role_shares
          .slice()
          .sort((a, b) => b.step_count - a.step_count)
          .map((role) => ({
            label: role.role,
            value: String(role.step_count),
            percent: Math.round(role.share_pct),
            color: role.share_pct > 40 ? C.redInk : C.brand,
          })),
      ),
    );

  out.push(h1('Process Catalogue', { pageBreak: true }));
  out.push(
    table(
      [
        '#',
        'Code',
        'Activity',
        'Description',
        ...(hasRoles ? ['Responsible'] : []),
        ...(showRatings ? ['Risk'] : []),
      ],
      steps.map((step) => [
        { t: String(step.SLN), bold: true, align: AlignmentType.CENTER },
        step.Code,
        { t: step.Name, bold: true },
        step.Description,
        ...(hasRoles ? [step.Responsible] : []),
        ...(showRatings ? [ratingCell(step['Risk Rating'])] : []),
      ]),
      hasRoles
        ? showRatings
          ? [0.5, 1.9, 2.4, 4.4, 1.9, 1.1]
          : [0.5, 1.9, 2.6, 4.7, 2.0]
        : showRatings
          ? [0.5, 1.9, 2.6, 5.7, 1.1]
          : [0.5, 1.9, 3.0, 6.1],
      17,
    ),
  );

  if (hasRoles) {
    out.push(h1('Swimlane Diagram', { pageBreak: true }));
    out.push(...swimlaneTables(bundle));
  }

  if (images.length) {
    out.push(h1('End-to-End Process Flow', { pageBreak: true }));
    out.push(...flowBlocks(bundle, images));
  }

  if (hasRoles) {
    out.push(h1('RACI Matrix', { pageBreak: true }));
    out.push(...raciTables(bundle));
  }

  if (riskRegisterRows(bundle).length) {
    out.push(h1('Risk and Control Register', { pageBreak: true }));
    out.push(...riskRegister(bundle));
  }

  out.push(h1('Detailed Step Register', { pageBreak: true }));
  steps.forEach((step, index) =>
    out.push(...stepCard(bundle, step, index, inDocument)),
  );

  out.push(h1('Glossary', { pageBreak: true }));
  out.push(...glossaryBlocks(bundle));
  return out;
}

/* ------------------------------------------------------------------ */
/* SOP                                                                 */
/* ------------------------------------------------------------------ */

/** Placeholder wording the model sometimes writes when the data has no value. It is never shown in an SOP. */
const EMPTY_PHRASE =
  /^(?:not\s+(?:defined|documented|recorded|specified|provided|available|stated|applicable|captured|mentioned)\b[^.;]*|no\s+[^.;]*\b(?:defined|recorded|documented|specified)\b[^.;]*|n\/?a|nil|none|unknown|tbd|—|-)[.;]?$/i;

function cs(value: unknown): string {
  let text = str(value);
  if (EMPTY_PHRASE.test(text)) return '';
  // A single sentence that only says the data has nothing on this.
  if (
    !/[.;]\s+\S/.test(text) &&
    /\b(?:in|from)\s+the\s+(?:source|BPM)\s+data\b/i.test(text) &&
    /\b(?:not|no|nothing)\b/i.test(text)
  ) {
    return '';
  }
  // Drop a leading placeholder sentence that is followed by real content.
  text = text.replace(
    /^Not\s+(?:defined|documented|recorded|specified|provided)\b[^.]*\.\s+(?=\S)/i,
    '',
  );
  return EMPTY_PHRASE.test(text) ? '' : text;
}

function csl(value: unknown): string[] {
  return asStrings(value).map(cs).filter(Boolean);
}

/** Removes "(005-001-001-001)" style references that the model copies into sentences. */
function withoutCodes(value: string): string {
  return value
    .replace(/\s*\(\s*\d{2,}(?:-\d+)+(?:\s*[,;]\s*\d{2,}(?:-\d+)+)*\s*\)/g, '')
    .replace(/\s+([.,;])/g, '$1')
    .trim();
}

function h2toc(title: string): Paragraph {
  const id = registerToc(title, 2);
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    keepNext: true,
    spacing: { before: 300, after: 100 },
    children: [
      new Bookmark({
        id,
        children: [run(title, { size: 26, bold: true, color: C.brandDark })],
      }),
    ],
  });
}

/** "005-001, 005-003, 005-006" becomes "005-001, 003, 006". */
function compactRefs(refs: string[]): string {
  let lastPrefix = '';
  return refs
    .map((ref) => {
      const cut = ref.lastIndexOf('-');
      if (cut <= 0) return ref;
      const prefix = ref.slice(0, cut);
      const tail = ref.slice(cut + 1);
      const out = prefix === lastPrefix ? tail : ref;
      lastPrefix = prefix;
      return out;
    })
    .join(', ');
}

/** [2,3,4,7] becomes "s2–4, s7". */
function stepRanges(steps: number[]): string {
  const sorted = [...new Set(steps)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j += 1;
    parts.push(
      j > i + 1
        ? `s${sorted[i]}–${sorted[j]}`
        : sorted
            .slice(i, j + 1)
            .map((n) => `s${n}`)
            .join(', '),
    );
    i = j + 1;
  }
  return parts.join(', ');
}

/**
 * The SOP: one consolidated document for the whole process function (or the one process).
 * What repeats across processes is written once; each process keeps its own step table.
 */
function sopMasterBlocks(
  meta: PipelineDocMeta,
  named: NamedBundle[],
  images: ProcessImages,
  master: SopMaster,
): Block[] {
  const multiple = named.length > 1;
  const single = !multiple;
  const out: Block[] = [];
  let n = 0;
  const section = (title: string, pageBreak = false) => {
    tocLevel = 1;
    return h1(`${(n += 1)}. ${title}`, { pageBreak });
  };
  const functionName = plainName(meta.departmentName);
  const subject = multiple ? functionName : plainName(meta.processName);
  const totalSteps = named.reduce(
    (sum, item) => sum + item.bundle.process.length,
    0,
  );
  const refOf = (index: number) => master.refs[index] ?? '';
  const front = master.front;

  out.push(
    p(
      multiple
        ? `This master SOP consolidates the ${named.length} ${functionName} processes (${totalSteps} steps) into one procedure. Rules, roles and controls that recur across processes are stated once; each process keeps its own codes, owners and key checks.`
        : `This SOP sets out how ${subject} is carried out (${totalSteps} steps): who performs each step, who verifies it, and which checks apply.`,
      {
        size: 22,
        fill: C.brandTint,
        barColor: C.brand,
        indent: 200,
        before: 0,
        after: 160,
        pageBreak: true,
      },
    ),
  );

  // 1. Document control
  setCodePrefix(named[0].bundle.process);
  out.push(section('Document control', false));
  const policyNames = new Map<string, string>();
  named.forEach((item) =>
    item.bundle.policies.forEach((list) =>
      list.forEach((policy) =>
        policyNames.set(
          policy.id,
          `${policy.name}${policy.version != null ? ` v${policy.version}.0` : ''}`,
        ),
      ),
    ),
  );
  const date = meta.generatedAt.slice(0, 10);
  out.push(
    kv(
      [
        ['Document ID', meta.processCode],
        ['Title', front.title || `${subject} — Standard Operating Procedure`],
        ['Company', meta.companyName || meta.companyCode],
        ['Process Function', functionName],
        [single ? 'Function Code' : 'Code', meta.departmentCode],
        ...(single
          ? ([
              ['Process', subject],
              ['Process Code', meta.processCode],
            ] as [string, string][])
          : []),
        ['Document Version', '1.0'],
        ['Classification', 'Internal'],
        [
          'Source',
          `BPM master data — ${multiple ? `all processes (${named.length}), ` : ''}${totalSteps} steps, generated ${date}`,
        ],
        ...(front.primaryPolicy
          ? ([['Primary policy', front.primaryPolicy]] as [string, string][])
          : []),
      ].filter(([, value]) => value) as [string, string][],
    ),
  );
  out.push(spacer(140));
  out.push(
    table(
      ['Role', 'Name', 'Signature', 'Date'],
      ['Prepared by', 'Reviewed by', 'Approved by'].map(
        (role) =>
          [
            { t: role, bold: true },
            { t: ' ' },
            { t: ' ' },
            { t: ' ' },
          ] as Cell[],
      ),
      [2.4, 3, 3, 1.6],
    ),
  );

  // 2. Purpose and scope
  if (front.purpose || front.inScope || front.outOfScope || multiple) {
    out.push(section('Purpose and scope'));
    if (front.purpose) out.push(p(front.purpose));
    if (front.inScope) out.push(p(front.inScope));
    if (front.outOfScope)
      out.push(
        p([run('Out of scope: ', { bold: true }), run(front.outOfScope)]),
      );
    if (multiple) {
      const showArea = Object.keys(front.areas).length > 0;
      out.push(spacer(80));
      out.push(
        table(
          [
            'Code',
            'Process',
            ...(showArea ? ['Area'] : []),
            'Steps',
            'Starts when',
            'Ends with',
          ],
          named.map((item, index) => {
            const overview = asRecord(item.bundle.overview);
            return [
              { t: refOf(index), bold: true },
              item.label.replace(/\s*\([^()]*\)\s*$/, ''),
              ...(showArea ? [front.areas[refOf(index)] ?? ''] : []),
              {
                t: String(item.bundle.process.length),
                align: AlignmentType.CENTER,
              },
              withoutCodes(cs(overview.trigger)),
              withoutCodes(cs(overview.outcome)),
            ] as Cell[];
          }),
          showArea ? [1, 2.2, 1.6, 0.8, 2.7, 2.7] : [1, 2.4, 0.8, 3, 3],
          17,
        ),
      );
    }
  }

  // 3. Roles
  const roles = master.roles.filter((role) => role.role);
  if (roles.length) {
    out.push(section('Roles and responsibilities'));
    const showProcesses =
      multiple && roles.some((role) => role.processes.length);
    out.push(
      table(
        ['Role', 'Responsibilities', ...(showProcesses ? ['Processes'] : [])],
        roles.map(
          (role) =>
            [
              { t: role.role, bold: true, color: C.brandDark },
              role.responsibilities || '—',
              ...(showProcesses
                ? [
                    role.processes[0] === 'All'
                      ? 'All processes'
                      : compactRefs(role.processes) || '—',
                  ]
                : []),
            ] as Cell[],
        ),
        showProcesses ? [2.6, 5.2, 2.2] : [3, 7],
        18,
      ),
    );
    out.push(...roleMatrix(named, master, master.refs));
  }

  // 4. Definitions and systems
  if (master.definitions.length || master.systems.length) {
    out.push(section('Definitions and systems'));
    if (master.definitions.length) {
      out.push(
        table(
          ['Term', 'Meaning'],
          master.definitions.map(
            (d) =>
              [
                { t: d.term, bold: true, color: C.brandDark },
                d.meaning,
              ] as Cell[],
          ),
          [2.6, 7.4],
          18,
        ),
      );
    }
    if (master.systems.length) {
      out.push(spacer(120));
      out.push(
        table(
          ['System', 'Used for'],
          master.systems.map(
            (d) =>
              [
                { t: d.system, bold: true, color: C.brandDark },
                d.usedFor || '—',
              ] as Cell[],
          ),
          [2.6, 7.4],
          18,
        ),
      );
    }
  }

  // 5. General rules
  if (master.rules.length || front.prerequisites) {
    out.push(
      section(
        multiple ? 'General rules (apply to every process)' : 'General rules',
      ),
    );
    master.rules.forEach((rule, index) =>
      out.push(
        p(
          [
            run(`${index + 1}.  `, { bold: true, color: C.brand }),
            run(`${rule.lead}${rule.lead ? '. ' : ''}`, { bold: true }),
            run(rule.text),
          ],
          {
            indent: 240,
            before: 50,
            after: 50,
          },
        ),
      ),
    );
    if (front.prerequisites) {
      out.push(spacer(60));
      out.push(
        p([run('Prerequisites. ', { bold: true }), run(front.prerequisites)]),
      );
    }
  }

  // Process flow (one process only; a whole function would need dozens of diagrams)
  if (single) {
    const flow = images.get(named[0].bundle) ?? [];
    if (flow.length) {
      out.push(section('Process flow', true));
      out.push(...flowBlocks(named[0].bundle, flow));
    }
  }

  // 6. Procedures
  out.push(section(single ? 'Procedure' : 'Procedures', true));
  out.push(
    p(
      '“By” performs the step; “Verified / approved by” signs it off before handoff. Turnaround (TAT) is per step.',
      { size: 19, color: C.muted, after: 60 },
    ),
  );
  named.forEach((item, index) => {
    const bundle = item.bundle;
    const rows = bundle.sopSteps;
    setCodePrefix(bundle.process);
    const title = `${n}.${index + 1} ${item.label}`;
    if (multiple) {
      tocLevel = 2;
      out.push(h2toc(title));
    }
    const overview = asRecord(bundle.overview);
    const startsWhen = withoutCodes(cs(overview.trigger));
    const endsWith = withoutCodes(cs(overview.outcome));
    if (startsWhen || endsWith) {
      out.push(
        p(
          [
            ...(startsWhen
              ? [
                  run('Starts when: ', { bold: true, color: C.brandDark }),
                  run(`${startsWhen}  `),
                ]
              : []),
            ...(endsWith
              ? [
                  run('Ends with: ', { bold: true, color: C.brandDark }),
                  run(endsWith),
                ]
              : []),
          ],
          { size: 20, after: 100 },
        ),
      );
    }
    const field = (key: string) => rows.map((row) => cs(row[key]));
    const showBy = field('by').some(Boolean);
    const showVerified = field('verified_by').some(Boolean);
    const showTat = field('tat').some(Boolean);
    const headers = [
      '#',
      'Step',
      ...(showBy ? ['By'] : []),
      ...(showVerified ? ['Verified / approved by'] : []),
      ...(showTat ? ['TAT'] : []),
      'Key actions and controls',
    ];
    const widths = [
      0.5,
      2.2,
      ...(showBy ? [1.6] : []),
      ...(showVerified ? [1.6] : []),
      ...(showTat ? [0.9] : []),
      3.8,
    ];
    out.push(
      table(
        headers,
        bundle.process.map((source, rowIndex) => {
          const row = rows[rowIndex] ?? {};
          return [
            {
              t: String(source.SLN),
              bold: true,
              align: AlignmentType.CENTER,
              fill: C.brandTint,
              color: C.brand,
            },
            { t: cs(row.step) || source.Name, bold: true },
            ...(showBy ? [cs(row.by)] : []),
            ...(showVerified ? [cs(row.verified_by)] : []),
            ...(showTat ? [cs(row.tat)] : []),
            cs(row.key_actions) || '—',
          ] as Cell[];
        }),
        widths,
        17,
      ),
    );
    const policies = [
      ...new Set(bundle.policies.flat().map((policy) => policy.name)),
    ];
    if (policies.length)
      out.push(
        labelled(
          'Related policy',
          policies.join('; '),
          C.policyAccent,
          'FDF2F3',
        ),
      );
    const links = new Map<string, RelatedSubProcessWordLink>();
    bundle.integrated.forEach((list) =>
      list.forEach((link) => links.set(link.id || link.code, link)),
    );
    out.push(...integratedBlocks([...links.values()], new Set<string>()));
  });
  setCodePrefix([]);

  // 7. Key controls
  const controls = master.controls;
  if (controls.length) {
    out.push(section('Key controls', true));
    out.push(
      table(
        ['Control', 'Where applied', 'Evidence'],
        controls.map((control) => {
          const where = control.applied
            .map((a) =>
              multiple
                ? `${a.process} ${stepRanges(a.steps)}`
                : stepRanges(a.steps),
            )
            .join('; ');
          return [
            { t: control.control, bold: true },
            [where, control.appliesToAll].filter(Boolean).join('; '),
            control.evidence || '—',
          ] as Cell[];
        }),
        [3.6, 3.6, 2.8],
        18,
      ),
    );
  }

  // 8. Exceptions and escalation
  if (master.exceptions.length) {
    out.push(section('Exceptions and escalation'));
    out.push(
      table(
        ['Situation', 'Action', 'Escalate to'],
        master.exceptions.map(
          (e) =>
            [
              { t: e.situation, bold: true },
              e.action || '—',
              e.escalateTo || '—',
            ] as Cell[],
        ),
        [3.4, 3.8, 2.8],
        18,
      ),
    );
  }

  // 9. Records
  if (master.records.length) {
    out.push(section('Records and retention'));
    out.push(
      table(
        ['Record', 'Held in'],
        master.records.map(
          (r) => [{ t: r.record, bold: true }, r.heldIn || '—'] as Cell[],
        ),
        [6, 4],
        18,
      ),
    );
  }

  // 10. Open items
  if (master.openItems.length) {
    out.push(section('Open items to resolve before approval'));
    out.push(
      p(
        'These gaps come from the BPM source data and should be closed by the process owners.',
        { size: 19, color: C.muted },
      ),
    );
    master.openItems.forEach((item) =>
      out.push(
        p(`☐  ${item}`, { indent: 240, size: 20, before: 40, after: 40 }),
      ),
    );
  }

  // 11. Related policies and references
  out.push(section('Related policies and references'));
  const policyDepartments = new Map<string, string>();
  named.forEach((item) =>
    item.bundle.policies.forEach((list) =>
      list.forEach((policy) =>
        policyDepartments.set(policy.id, policy.departmentName || ''),
      ),
    ),
  );
  [...policyNames.entries()].forEach(([id, label]) =>
    out.push(
      p(
        `${label}${policyDepartments.get(id) ? ` (${policyDepartments.get(id)})` : ''}`,
        { bullet: true, size: 20 },
      ),
    ),
  );
  out.push(
    p(`Source: BPM master data, version 1.0, generated ${date}`, {
      bullet: true,
      size: 20,
    }),
  );
  out.push(spacer(140));
  out.push(
    table(
      ['Version', 'Date', 'Note'],
      [
        [
          '1.0',
          date,
          multiple
            ? `Consolidated master SOP from the ${named.length} BPM processes`
            : 'Generated from BPM master data',
        ],
      ],
      [1.5, 2, 6.5],
    ),
  );
  return out;
}

/** Summary SOP: the whole process on one or two pages. */
function summaryDocumentBlocks(
  bundle: PipelineBundle,
  label: string,
  single: boolean,
): Block[] {
  const data = asRecord(bundle.summary);
  const out: Block[] = [];
  const linkedPolicies = bundle.policies.reduce(
    (sum, list) => sum + list.length,
    0,
  );
  if (single) {
    out.push(
      statCards([
        { value: String(bundle.process.length), label: 'Steps' },
        { value: String(asList(data.key_steps).length), label: 'Key steps' },
        { value: String(bundle.stats.role_shares.length), label: 'Roles' },
        { value: String(linkedPolicies), label: 'Linked policies' },
      ]),
    );
    out.push(spacer(80));
  } else {
    // In a pack of many processes each process gets one page, so the figures are one line.
    out.push(
      p(
        `${bundle.process.length} steps · ${asList(data.key_steps).length} key steps · ${bundle.stats.role_shares.length} roles${linkedPolicies ? ` · ${linkedPolicies} linked ${linkedPolicies === 1 ? 'policy' : 'policies'}` : ''}`,
        { size: 18, color: C.muted, before: 0, after: 100 },
      ),
    );
  }
  if (cs(data.purpose))
    out.push(
      p(cs(data.purpose), {
        size: 22,
        fill: C.brandTint,
        barColor: C.brand,
        indent: 200,
      }),
    );
  if (cs(data.use_when)) out.push(labelled('Use this when', cs(data.use_when)));

  // Every step code must be covered. Anything the summary left out is listed explicitly.
  const keySteps = asList(data.key_steps);
  const covered = new Set(
    keySteps.flatMap((step) => csl(step.covers).map(codeKey)),
  );
  const missing = bundle.process
    .filter((step) => !covered.has(codeKey(step.Code)))
    .map((step) => step.Code);
  if (keySteps.length || missing.length) {
    out.push(h3('Key steps'));
    out.push(
      table(
        ['#', 'What to do', 'Owner', 'Steps'],
        [
          ...keySteps.map(
            (step, index) =>
              [
                {
                  t: String(index + 1),
                  bold: true,
                  align: AlignmentType.CENTER,
                  fill: C.brandTint,
                  color: C.brand,
                },
                { t: cs(step.step), bold: true },
                cs(step.owner) || '—',
                csl(step.covers).map(sc).join(', ') || '—',
              ] as Cell[],
          ),
          ...(missing.length
            ? [
                [
                  {
                    t: '+',
                    bold: true,
                    align: AlignmentType.CENTER,
                    fill: C.brandTint,
                    color: C.brand,
                  },
                  { t: 'Remaining steps — see the full SOP', bold: true },
                  '—',
                  missing.map(sc).join(', '),
                ] as Cell[],
              ]
            : []),
        ],
        [0.6, 5.6, 2.2, 1.8],
        19,
      ),
    );
  }
  const roles = asList(data.roles);
  if (roles.length) {
    out.push(h3('Who does what'));
    out.push(
      table(
        ['Role', 'Responsibility'],
        roles.map(
          (r) =>
            [
              { t: cs(r.role), bold: true, color: C.brandDark },
              cs(r.does) || '—',
            ] as Cell[],
        ),
        [2.6, 7.4],
        19,
      ),
    );
  }
  const controls = csl(data.key_controls);
  if (controls.length) {
    out.push(h3('Key controls'));
    controls.forEach((item) => out.push(p(item, { bullet: true, size: 20 })));
  }
  const records = csl(data.records);
  // A pack of many processes keeps each process to one page; the records are in the SOP.
  if (records.length && single) {
    out.push(h3('Records to keep'));
    records.forEach((item) => out.push(p(item, { bullet: true, size: 20 })));
  }
  const watch = csl(data.watch_outs);
  if (watch.length) {
    out.push(h3('Watch out'));
    watch.forEach((item) => out.push(labelled('', item, C.amberInk, 'FFF8E6')));
  }
  if (cs(data.escalation))
    out.push(labelled('Escalate', cs(data.escalation), C.redInk, 'FDF2F3'));

  const policyNames = new Map<string, string>();
  bundle.policies.forEach((list) =>
    list.forEach((policy) =>
      policyNames.set(
        policy.id,
        `${policy.name}${policy.version != null ? ` (v${policy.version}.0)` : ''}`,
      ),
    ),
  );
  if (policyNames.size && single) {
    out.push(h3('Related policies'));
    [...policyNames.values()].forEach((name) =>
      out.push(p(name, { bullet: true, size: 20 })),
    );
  }
  out.push(spacer(100));
  out.push(
    p(
      `Full detail for "${label}": see the Business Process Document and the Standard Operating Procedure.`,
      { size: 17, color: C.muted, italics: true },
    ),
  );
  return out;
}

/* ------------------------------------------------------------------ */
/* SOP: who works on which process                                     */
/* ------------------------------------------------------------------ */

/** Process column heading: the last group of the ref when every ref shares the same start. */
function shortRefs(refs: string[]): string[] {
  const starts = new Set(refs.map((ref) => ref.slice(0, ref.lastIndexOf('-'))));
  return refs.map((ref) =>
    starts.size === 1 && ref.includes('-')
      ? ref.slice(ref.lastIndexOf('-') + 1)
      : ref,
  );
}

/** Roles against processes, counted from the steps: ● performs, ✓ verifies or approves. */
function roleMatrix(
  named: NamedBundle[],
  master: SopMaster,
  refs: string[],
): Block[] {
  const roles = master.roles.filter((role) => role.names?.length);
  if (named.length < 2 || named.length > 24 || !roles.length) return [];
  const cells = roles.map((role) => {
    const keys = new Set(role.names.map(roleKey));
    return named.map((item) => {
      let performs = false;
      let verifies = false;
      for (const step of item.bundle.process) {
        const links = stepRoleLinks(step);
        if (links.performs.some((name) => keys.has(roleKey(name))))
          performs = true;
        else if (links.verifies.some((name) => keys.has(roleKey(name))))
          verifies = true;
      }
      return `${performs ? '●' : ''}${verifies ? '✓' : ''}`;
    });
  });
  const rows = roles
    .map((role, index) => ({ role, row: cells[index] }))
    .filter((entry) => entry.row.some(Boolean));
  if (!rows.length) return [];
  const size = named.length > 14 ? 15 : 17;
  return [
    h3('Who works on which process'),
    p(
      `● performs steps    ✓ verifies or approves    (columns are the processes ${refs[0]?.slice(0, refs[0].lastIndexOf('-') + 1) || ''}…)`,
      { size: 17, color: C.muted, italics: true },
    ),
    table(
      ['Role', ...shortRefs(refs)],
      rows.map(({ role, row }) => [
        { t: role.role, bold: true, color: C.brandDark },
        ...row.map(
          (value) =>
            ({
              t: value,
              blank: !value,
              align: AlignmentType.CENTER,
              color: C.brand,
              bold: true,
              fill: value ? C.brandTint : undefined,
            }) as Cell,
        ),
      ]),
      [3.2, ...refs.map(() => 0.6)],
      size,
    ),
  ];
}

/* ------------------------------------------------------------------ */
/* Summary SOP: the page that opens a whole process function            */
/* ------------------------------------------------------------------ */

function summaryOverviewBlocks(
  meta: PipelineDocMeta,
  named: NamedBundle[],
  overview: SummaryOverview,
  master?: SopMaster,
): Block[] {
  const out: Block[] = [];
  const functionName = plainName(meta.departmentName);
  const totalSteps = named.reduce(
    (sum, item) => sum + item.bundle.process.length,
    0,
  );
  out.push(h1(`${functionName} at a glance`, { pageBreak: true }));
  const roleCount = master?.roles.length ?? 0;
  out.push(
    statCards([
      { value: String(named.length), label: 'Processes' },
      { value: String(totalSteps), label: 'Steps' },
      ...(roleCount ? [{ value: String(roleCount), label: 'Roles' }] : []),
      ...(master?.controls.length
        ? [{ value: String(master.controls.length), label: 'Key controls' }]
        : []),
    ]),
  );
  out.push(spacer(80));
  if (cs(overview.purpose))
    out.push(
      p(cs(overview.purpose), {
        size: 22,
        fill: C.brandTint,
        barColor: C.brand,
        indent: 200,
      }),
    );
  if (cs(overview.journey)) out.push(p(cs(overview.journey), { size: 21 }));

  out.push(h3('The processes'));
  out.push(
    table(
      ['Code', 'Process', 'What it does', 'Steps', 'Main roles'],
      named.map((item, index) => {
        const ref = overview.refs[index] ?? '';
        const lead = [...item.bundle.stats.role_shares]
          .sort((a, b) => b.step_count - a.step_count)
          .map((entry) => entry.role)
          .filter(
            (role, at, all) =>
              all.findIndex((r) => roleKey(r) === roleKey(role)) === at,
          )
          .slice(0, 3)
          .join(', ');
        return [
          { t: ref, bold: true },
          { t: item.label.replace(/\s*\([^()]*\)\s*$/, ''), bold: true },
          cs(overview.does[ref]) || '—',
          {
            t: String(item.bundle.process.length),
            align: AlignmentType.CENTER,
          },
          lead || '—',
        ] as Cell[];
      }),
      [1, 2.2, 4, 0.8, 2.6],
      17,
    ),
  );

  const roles = (master?.roles ?? []).filter((role) => role.role).slice(0, 8);
  if (roles.length) {
    out.push(h3('Key roles'));
    out.push(
      table(
        ['Role', 'Responsibility', 'Processes'],
        roles.map(
          (role) =>
            [
              { t: role.role, bold: true, color: C.brandDark },
              role.responsibilities || '—',
              role.processes[0] === 'All'
                ? 'All'
                : compactRefs(role.processes) || '—',
            ] as Cell[],
        ),
        [2.4, 5.6, 2],
        18,
      ),
    );
    if ((master?.roles.length ?? 0) > roles.length)
      out.push(
        p('The full list of roles is in the Standard Operating Procedure.', {
          size: 17,
          color: C.muted,
          italics: true,
        }),
      );
  }
  if (overview.topControls.length) {
    out.push(h3('Key controls across the function'));
    overview.topControls.forEach((item) =>
      out.push(p(item, { bullet: true, size: 20 })),
    );
  }
  if (overview.watchOuts.length) {
    out.push(h3('Watch out'));
    overview.watchOuts.forEach((item) =>
      out.push(labelled('', item, C.amberInk, 'FFF8E6')),
    );
  }
  if (cs(overview.escalation))
    out.push(labelled('Escalate', cs(overview.escalation), C.redInk, 'FDF2F3'));
  out.push(spacer(100));
  out.push(
    p('A one-to-two page summary of each process follows.', {
      size: 17,
      color: C.muted,
      italics: true,
    }),
  );
  return out;
}

/* ------------------------------------------------------------------ */
/* Job descriptions                                                    */
/* ------------------------------------------------------------------ */

/** Reporting lines as a picture. Null when no line is known or no renderer is available. */
async function renderOrgChart(jd: JdMaster): Promise<FlowImage | null> {
  const edges = jd.roles.filter((role) => role.reportsTo);
  if (!edges.length || process.env.BPM_FLOW_DISABLE_RENDER === '1') return null;
  const clean = (value: string) =>
    value
      .replace(/["<>{}()[\]|#;&]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const ids = new Map<string, string>();
  const nodes: string[] = [];
  const nodeFor = (name: string) => {
    const key = roleKey(name);
    if (ids.has(key)) return ids.get(key);
    const id = `N${ids.size}`;
    ids.set(key, id);
    const role = jd.roles.find((r) => roleKey(r.name) === key);
    nodes.push(
      role
        ? `  ${id}["<b>${clean(role.name)}</b><br/>${role.performs} performed · ${role.verifies} verified"]:::role`
        : `  ${id}["${clean(name)}"]:::ext`,
    );
    return id;
  };
  const lines: string[] = [];
  for (const role of edges)
    lines.push(`  ${nodeFor(role.reportsTo)} --> ${nodeFor(role.name)}`);
  const code = [
    // Many people under one manager read better as a list going down than as a very wide tree.
    edges.length > 6 ? 'flowchart LR' : 'flowchart TB',
    '  classDef role fill:#F8ECEF,stroke:#8B1E3F,color:#5E1329,stroke-width:1.5px',
    '  classDef ext fill:#FFFFFF,stroke:#9CA3AF,color:#6B7280,stroke-dasharray:4 3',
    ...nodes,
    ...lines,
  ].join('\n');
  const png = await renderMermaidPngBest(code).catch((): Buffer | null => null);
  const dim = png ? pngSize(png) : null;
  if (!png || !dim || dim.width < 120) return null;
  // A small chart must not fill a page: the height allowed grows with the number of boxes.
  const maxHeight = Math.min(700, 120 + ids.size * 55);
  const scale = Math.min(660 / dim.width, maxHeight / dim.height, 1);
  return {
    data: png,
    width: Math.round(dim.width * scale),
    height: Math.round(dim.height * scale),
  };
}

function stepRefLabel(ref: string, steps: number[], multiple: boolean) {
  const range = stepRanges(steps);
  return multiple ? `${ref} ${range}` : range;
}

function roleSection(
  role: JdRole,
  jd: JdMaster,
  multiple: boolean,
  heading: Paragraph,
): Block[] {
  const out: Block[] = [heading];
  out.push(
    statCards([
      { value: String(role.performs), label: 'Steps performed' },
      { value: String(role.verifies), label: 'Steps verified' },
      { value: String(role.processes.length), label: 'Processes' },
      ...(role.controls.length
        ? [{ value: String(role.controls.length), label: 'Controls' }]
        : []),
    ]),
  );
  out.push(spacer(80));
  if (role.purpose)
    out.push(
      p(
        [
          run('Job purpose  ', { bold: true, color: C.brand, size: 21 }),
          run(role.purpose, { size: 21 }),
        ],
        { fill: C.brandTint, barColor: C.brand, indent: 200 },
      ),
    );
  out.push(spacer(60));
  const none = (value: string): Cell =>
    value ? value : { t: 'To be confirmed', color: C.muted };
  out.push(
    table(
      ['Reports to', 'Direct reports', 'Systems', 'Authority'],
      [
        [
          none(role.reportsTo),
          role.directReports.length ? role.directReports.join(', ') : '—',
          role.systems.length ? role.systems.join(', ') : '—',
          [
            `Performs ${role.performs} step${role.performs === 1 ? '' : 's'}; verifies ${role.verifies}`,
            role.authority,
          ]
            .filter(Boolean)
            .join('\n'),
        ],
      ],
      [2, 2.4, 2.8, 2.8],
      18,
    ),
  );
  if (multiple && role.processes.length)
    out.push(
      labelled(
        'Processes',
        role.processes.length === jd.refs.length && jd.refs.length > 3
          ? `All ${jd.refs.length} processes`
          : role.processes
              .map((ref) =>
                jd.processNames[ref] ? `${ref} ${jd.processNames[ref]}` : ref,
              )
              .join('; '),
        C.greyInk,
        C.zebra,
      ),
    );

  out.push(h3('Key responsibilities'));
  for (const group of role.responsibilities) {
    if (multiple)
      out.push(
        p(
          [
            run(`${group.process}  `, { bold: true, color: C.brand, size: 20 }),
            run(jd.processNames[group.process] ?? '', {
              bold: true,
              color: C.brandDark,
              size: 20,
            }),
          ],
          { before: 140, after: 30, keepNext: true },
        ),
      );
    for (const item of group.items) {
      const meta = [stepRefLabel(group.process, item.steps, multiple), item.tat]
        .filter(Boolean)
        .join(' · ');
      out.push(
        p(
          [
            // The chip is only needed when the sentence does not already say it is a check.
            ...(item.kind === 'verifies' &&
            role.performs > 0 &&
            !/^(?:verif|approv|review|check|confirm|sign|authoris|validat)/i.test(
              item.text,
            )
              ? [run('Verify  ', { bold: true, color: C.blueInk, size: 18 })]
              : []),
            run(item.text, { size: 20 }),
            run(`  (${meta})`, { size: 16, color: C.muted }),
          ],
          { bullet: true, before: 30, after: 30 },
        ),
      );
    }
  }
  if (role.worksWith.length) out.push(spacer(80));
  if (role.worksWith.length)
    out.push(
      labelled('Works with', role.worksWith.join(', '), C.greyInk, C.zebra),
    );
  if (role.controls.length)
    out.push(
      labelled(
        'Controls on these steps',
        role.controls.join(', '),
        C.greyInk,
        C.zebra,
      ),
    );
  if (role.standards.length) {
    out.push(h3('Performance standards'));
    role.standards.forEach((item) =>
      out.push(p(item, { bullet: true, size: 20 })),
    );
  }
  out.push(h3('To be completed by HR'));
  out.push(
    kv(
      ['Grade / level', 'Qualifications', 'Experience', 'Headcount'].map(
        (label) => [label, { t: ' ', blank: true }] as [string, Cell],
      ),
    ),
  );
  return out;
}

function jdBlocks(
  meta: PipelineDocMeta,
  named: NamedBundle[],
  jd: JdMaster,
  orgChart: FlowImage | null,
): Block[] {
  const multiple = named.length > 1;
  const out: Block[] = [];
  let n = 0;
  const section = (title: string, pageBreak = false) => {
    tocLevel = 1;
    return h1(`${(n += 1)}. ${title}`, { pageBreak });
  };
  const functionName = plainName(meta.departmentName);
  const subject = multiple ? functionName : plainName(meta.processName);
  setCodePrefix(named[0].bundle.process);

  out.push(
    p(
      `These job descriptions cover the ${jd.roles.length} ${subject} role${jd.roles.length === 1 ? '' : 's'} that perform or verify steps in ${multiple ? `the ${named.length} processes` : 'this process'} (${jd.totalSteps} steps) at ${meta.companyName?.split(':').pop()?.trim() || 'the company'}. Each one lists what the role does, what it signs off and the turnaround times it must meet.`,
      {
        size: 22,
        fill: C.brandTint,
        barColor: C.brand,
        indent: 200,
        before: 0,
        after: 160,
        pageBreak: true,
      },
    ),
  );

  out.push(section('Document control'));
  out.push(
    kv(
      [
        ['Document ID', meta.processCode],
        ['Title', `${subject} — Job Descriptions`],
        ['Company', meta.companyName || meta.companyCode],
        ['Process Function', functionName],
        [multiple ? 'Code' : 'Function Code', meta.departmentCode],
        ...(multiple
          ? []
          : ([
              ['Process', subject],
              ['Process Code', meta.processCode],
            ] as [string, string][])),
        ['Document Version', '1.0'],
        ['Classification', 'Internal'],
        [
          'Source',
          `BPM master data — ${jd.totalSteps} steps, generated ${meta.generatedAt.slice(0, 10)}`,
        ],
      ].filter(([, value]) => value) as [string, string][],
    ),
  );
  out.push(spacer(140));
  out.push(
    table(
      ['Role', 'Name', 'Signature', 'Date'],
      ['Prepared by', 'Reviewed by', 'Approved by'].map(
        (role) =>
          [
            { t: role, bold: true },
            { t: ' ' },
            { t: ' ' },
            { t: ' ' },
          ] as Cell[],
      ),
      [2.4, 3, 3, 1.6],
    ),
  );
  out.push(spacer(80));
  out.push(
    p(
      'Reporting lines follow the BPM verification chain: the role that verifies a step is shown as the line manager. The BPM data holds no qualifications, grades or headcount, so HR completes the box at the end of each job description before it is issued.',
      { size: 19, color: C.muted, italics: true },
    ),
  );

  out.push(section('Roles at a glance'));
  const showLevel = jd.roles.some((role) => role.level);
  out.push(
    table(
      [
        'Role',
        ...(showLevel ? ['Level'] : []),
        'Reports to',
        ...(multiple ? ['Main processes'] : []),
        'Performs',
        'Verifies',
      ],
      jd.roles.map(
        (role) =>
          [
            { t: role.name, bold: true, color: C.brandDark },
            ...(showLevel ? [role.level || '—'] : []),
            role.reportsTo || '—',
            ...(multiple
              ? [
                  role.processes.length === jd.refs.length && jd.refs.length > 3
                    ? `All ${jd.refs.length}`
                    : compactRefs(role.processes) || '—',
                ]
              : []),
            { t: String(role.performs), align: AlignmentType.CENTER },
            { t: String(role.verifies), align: AlignmentType.CENTER },
          ] as Cell[],
      ),
      showLevel
        ? multiple
          ? [2.5, 1.4, 2, 2.2, 1, 1]
          : [3, 1.6, 2.6, 1.1, 1.1]
        : multiple
          ? [2.8, 2.2, 2.6, 1.1, 1.1]
          : [3.6, 3, 1.2, 1.2],
      18,
    ),
  );
  out.push(
    p(
      'Step counts come from the "performed by" and "verified or approved by" fields of each BPM step; a step shared by two roles counts for both.',
      { size: 17, color: C.muted, italics: true },
    ),
  );
  if (orgChart) {
    out.push(h3('Reporting lines'));
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 100, after: 140 },
        children: [
          new ImageRun({
            type: 'png',
            data: orgChart.data,
            transformation: {
              width: orgChart.width,
              height: orgChart.height,
            },
          }),
        ],
      }),
    );
  }

  jd.roles.forEach((role) => {
    out.push(...roleSection(role, jd, multiple, section(role.name, true)));
  });

  if (jd.outside.length) {
    out.push(section('Roles outside this function', true));
    out.push(
      p(
        'These names appear in the BPM steps but belong to another department or an outside party, so no job description is written for them here.',
        { size: 20 },
      ),
    );
    out.push(
      table(
        ['Role', 'Processes', 'Performs', 'Verifies'],
        jd.outside.map(
          (role) =>
            [
              { t: role.name, bold: true },
              compactRefs(role.processes) || '—',
              { t: String(role.performs), align: AlignmentType.CENTER },
              { t: String(role.verifies), align: AlignmentType.CENTER },
            ] as Cell[],
        ),
        [4, 3.4, 1.3, 1.3],
        18,
      ),
    );
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Cover, table of contents, packaging                                 */
/* ------------------------------------------------------------------ */

function page() {
  return {
    size: {
      orientation: PageOrientation.PORTRAIT,
      width: 12240,
      height: 15840,
    },
    margin: {
      top: 1000,
      right: 900,
      bottom: 1000,
      left: 900,
      header: 500,
      footer: 500,
    },
  };
}

/** Drops a leading code such as "005-000-000_" from a name. */
function plainName(value: string): string {
  return (
    value.replace(/^\s*\d+(?:-\d+)+\s*[_:\-–—]\s*/, '').trim() || value.trim()
  );
}

function coverFacts(meta: PipelineDocMeta): [string, string][] {
  const single = meta.scope === 'process';
  return [
    ['Company', meta.companyName || meta.companyCode],
    ['Process Function', plainName(meta.departmentName)],
    [single ? 'Function Code' : 'Code', meta.departmentCode],
    ...(single
      ? ([
          ['Process', plainName(meta.processName)],
          ['Process Code', meta.processCode],
        ] as [string, string][])
      : []),
    ['Document Version', '1.0'],
    ['Classification', 'Internal'],
    ['Generated', meta.generatedAt.slice(0, 10)],
  ].filter(([, value]) => value) as [string, string][];
}

async function coverChildren(
  meta: PipelineDocMeta,
  subtitle: string,
): Promise<Block[]> {
  const logo = await companyLogoParagraph();
  const none = { style: BorderStyle.NONE, size: 0, color: C.white };
  const band = new Table({
    width: { size: PAGE_W, type: WidthType.DXA },
    columnWidths: [PAGE_W],
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: PAGE_W, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill: C.brand, color: 'auto' },
            margins: { top: 500, bottom: 500, left: 400, right: 400 },
            borders: { top: none, bottom: none, left: none, right: none },
            children: [
              new Paragraph({
                spacing: { before: 0, after: 100 },
                children: [
                  run(subtitle.toUpperCase(), {
                    size: 20,
                    bold: true,
                    color: 'F3C9D5',
                  }),
                ],
              }),
              new Paragraph({
                spacing: { before: 0, after: 120 },
                children: [
                  run(plainName(meta.processName || meta.title), {
                    size: 52,
                    bold: true,
                    color: C.white,
                  }),
                ],
              }),
              new Paragraph({
                spacing: { before: 0, after: 0 },
                children: [
                  run(
                    meta.processCode
                      ? `Process code ${meta.processCode}`
                      : meta.title,
                    { size: 24, color: 'F3C9D5' },
                  ),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });
  return [
    ...(logo ? [logo] : []),
    spacer(600),
    band,
    spacer(400),
    kv(coverFacts(meta)),
  ];
}

function tocBlocks(
  pages: Map<string, number> | 'placeholder' | null,
): (Block | TableOfContents)[] {
  const out: (Block | TableOfContents)[] = [
    new Paragraph({
      spacing: { before: 0, after: 200 },
      border: {
        bottom: {
          style: BorderStyle.SINGLE,
          size: 12,
          color: C.brand,
          space: 4,
        },
      },
      children: [
        run('Table of Contents', { size: 32, bold: true, color: C.brand }),
      ],
    }),
  ];
  if (!pages) {
    out.push(
      new TableOfContents('Table of contents', {
        hyperlink: true,
        headingStyleRange: '1-1',
      }),
    );
    return out;
  }
  for (const entry of tocEntries) {
    const topLevel = entry.level === 1;
    const text = new TextRun({
      text: entry.title,
      font: 'Calibri',
      size: topLevel ? 22 : 20,
      bold: topLevel,
      color: topLevel ? C.brandDark : C.ink,
    });
    out.push(
      new Paragraph({
        spacing: { before: topLevel ? 120 : 20, after: topLevel ? 20 : 20 },
        indent: { left: topLevel ? 0 : 360 },
        tabStops: [
          { type: TabStopType.RIGHT, position: PAGE_W, leader: LeaderType.DOT },
        ],
        children: [
          new InternalHyperlink({ anchor: entry.id, children: [text] }),
          new TextRun({ text: '\t', font: 'Calibri', size: 20 }),
          // Plain text on purpose: viewers that re-evaluate PAGEREF fields can show "1" for every entry.
          new TextRun({
            text:
              pages === 'placeholder'
                ? '00'
                : String(pages.get(entry.id) ?? ''),
            font: 'Calibri',
            size: topLevel ? 22 : 20,
            bold: topLevel,
            color: topLevel ? C.brandDark : C.ink,
          }),
        ],
      }),
    );
  }
  return out;
}

async function pack(
  sections: ISectionOptions[],
  refreshFields = false,
): Promise<Buffer> {
  const doc = new Document({
    creator: 'BPM',
    title: 'Business Process Document',
    features: { updateFields: refreshFields },
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 21, color: C.ink } },
      },
      paragraphStyles: [
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 32, bold: true, color: C.brand, font: 'Calibri' },
        },
        {
          id: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 26, bold: true, color: C.brandDark, font: 'Calibri' },
        },
      ],
    },
    sections,
  });
  return Packer.toBuffer(doc);
}

/* ------------------------------------------------------------------ */
/* Page numbers for the table of contents (two-pass render)            */
/* ------------------------------------------------------------------ */

function normaliseLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Renders the document once with LibreOffice and reads the page where each heading lands.
 * Returns null when no renderer is available, so the caller can fall back to a Word TOC field.
 */
async function measureHeadingPages(
  docx: Buffer,
  entries: TocEntry[],
): Promise<Map<string, number> | null> {
  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), 'bpm-toc-'));
    const input = join(dir, 'doc.docx');
    await writeFile(input, docx);
    await execFileAsync(
      'soffice',
      [
        `-env:UserInstallation=file://${join(dir, 'profile')}`,
        '--headless',
        '--convert-to',
        'pdf',
        '--outdir',
        dir,
        input,
      ],
      { timeout: 240_000 },
    );
    const { stdout } = await execFileAsync(
      'pdftotext',
      ['-layout', join(dir, 'doc.pdf'), '-'],
      {
        timeout: 60_000,
        maxBuffer: 200 * 1024 * 1024,
      },
    );
    const pages = stdout
      .split('\f')
      .map((text) => text.split('\n').map(normaliseLine).filter(Boolean));
    const result = new Map<string, number>();
    let pointer = 0;
    for (const entry of entries) {
      const wanted = normaliseLine(entry.title);
      let found = -1;
      for (let page = pointer; page < pages.length; page += 1) {
        const hit = pages[page].some(
          (line) =>
            line === wanted ||
            (line.length >= 15 &&
              wanted.startsWith(line) &&
              !/\.{3,}/.test(line)),
        );
        if (hit) {
          found = page;
          break;
        }
      }
      if (found < 0) {
        console.warn(
          `[word-export] TOC measurement could not find heading: ${entry.title}`,
        );
        return null;
      }
      result.set(entry.id, found + 1);
      pointer = found;
    }
    return result;
  } catch (error) {
    console.warn(
      `[word-export] TOC measurement failed: ${error instanceof Error ? error.message.split('\n')[0] : error}`,
    );
    return null;
  } finally {
    if (dir)
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/* ------------------------------------------------------------------ */
/* Public builders                                                     */
/* ------------------------------------------------------------------ */

type NamedBundle = { label: string; bundle: PipelineBundle };

type DocKind = 'bpm' | 'sop' | 'summary' | 'jd';

/** What a document needs besides the process data. */
type DocExtras = {
  master?: SopMaster;
  overview?: SummaryOverview;
  jd?: JdMaster;
  orgChart?: FlowImage | null;
};

function assembleBody(
  kind: DocKind,
  meta: PipelineDocMeta,
  bundles: NamedBundle[],
  images: ProcessImages,
  extras: DocExtras = {},
): Block[] {
  tocEntries = [];
  tocCounter = 0;
  const { master } = extras;
  if (kind === 'sop') {
    if (!master) throw new Error('The SOP content is missing.');
    return sopMasterBlocks(meta, bundles, images, master);
  }
  if (kind === 'jd') {
    if (!extras.jd) throw new Error('The job description content is missing.');
    return jdBlocks(meta, bundles, extras.jd, extras.orgChart ?? null);
  }
  const inDocument = new Set<string>();
  for (const item of bundles) {
    for (const step of item.bundle.process)
      inDocument.add(subProcessBookmarkId(step.Code));
  }
  const body: Block[] = [];
  const multiple = bundles.length > 1;
  if (kind === 'summary' && multiple && extras.overview) {
    tocLevel = 1;
    body.push(...summaryOverviewBlocks(meta, bundles, extras.overview, master));
  }
  bundles.forEach((item) => {
    const bundle = item.bundle;
    setCodePrefix(bundle.process);
    if (multiple) {
      const id = registerToc(item.label, 1);
      body.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          pageBreakBefore: true,
          keepNext: true,
          spacing: { before: 0, after: 200 },
          shading: { type: ShadingType.CLEAR, fill: C.brand, color: 'auto' },
          children: [
            new Bookmark({
              id,
              children: [
                run(`  ${item.label}`, {
                  size: 36,
                  bold: true,
                  color: C.white,
                }),
              ],
            }),
          ],
        }),
      );
      tocLevel = 2;
    } else {
      tocLevel = 1;
    }
    if (kind === 'bpm') {
      body.push(
        ...processBlocks(
          bundle,
          images.get(bundle) ?? [],
          inDocument,
          !multiple,
        ),
      );
    } else {
      if (!multiple) body.push(h1('Summary', { toc: false }));
      body.push(...summaryDocumentBlocks(bundle, item.label, !multiple));
    }
  });
  return body;
}

async function buildDocument(
  meta: PipelineDocMeta,
  bundles: NamedBundle[],
  kind: DocKind,
  subtitle: string,
  extras: DocExtras = {},
): Promise<Buffer> {
  const header = await buildDocumentHeader();
  const footer = buildDocumentFooter(meta.docxFilename, meta.generatedAt);
  const coverFooter = buildCoverPageFooter(meta.docxFilename, meta.generatedAt);
  const cover = await coverChildren(meta, subtitle);
  const images: ProcessImages = new Map();
  // One process gets its flow diagram in the SOP. A whole function would need dozens, so it gets none.
  const queue =
    kind === 'summary' ||
    kind === 'jd' ||
    (kind === 'sop' && bundles.length > 1)
      ? []
      : [...bundles];
  await Promise.all(
    Array.from({ length: Math.min(3, queue.length) }, async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        images.set(item.bundle, await fetchFlowImages(item.bundle));
      }
    }),
  );

  // A one-process Summary SOP is two pages: a table of contents would only add a page.
  const withToc = kind !== 'summary' || bundles.length > 1;
  const assemble = async (
    pages: Map<string, number> | 'placeholder' | null,
  ): Promise<{ buffer: Buffer; entries: TocEntry[] }> => {
    // The body is assembled first so the table of contents knows every heading.
    const body = assembleBody(kind, meta, bundles, images, extras);
    const entries = tocEntries;
    const sections: ISectionOptions[] = [
      {
        properties: { page: page() },
        headers: { default: emptyFirstPageHeader() },
        footers: { default: coverFooter },
        children: cover,
      },
      {
        properties: { page: page() },
        headers: { default: header },
        footers: { default: footer },
        children: [...(withToc ? tocBlocks(pages) : []), ...body],
      },
    ];
    return { buffer: await pack(sections, pages === null), entries };
  };

  // Pass 1 measures where each heading lands. Pass 2 writes the real page numbers.
  if (!withToc) return (await assemble('placeholder')).buffer;
  const probe = await assemble('placeholder');
  const measured = await measureHeadingPages(probe.buffer, probe.entries);
  return (await assemble(measured ?? null)).buffer;
}

export async function buildPipelineBpmDocx(
  meta: PipelineDocMeta,
  bundles: NamedBundle[],
): Promise<Buffer> {
  return buildDocument(meta, bundles, 'bpm', 'Business Process Document');
}

export async function buildPipelineSopDocx(
  meta: PipelineDocMeta,
  bundles: NamedBundle[],
  master: SopMaster,
): Promise<Buffer> {
  return buildDocument(meta, bundles, 'sop', 'Standard Operating Procedure', {
    master,
  });
}

export async function buildPipelineSummaryDocx(
  meta: PipelineDocMeta,
  bundles: NamedBundle[],
  overview?: SummaryOverview,
  master?: SopMaster,
): Promise<Buffer> {
  return buildDocument(meta, bundles, 'summary', 'Summary SOP', {
    overview,
    master,
  });
}

export async function buildPipelineJdDocx(
  meta: PipelineDocMeta,
  bundles: NamedBundle[],
  jd: JdMaster,
): Promise<Buffer> {
  const orgChart = await renderOrgChart(jd);
  return buildDocument(meta, bundles, 'jd', 'Job Descriptions', {
    jd,
    orgChart,
  });
}
