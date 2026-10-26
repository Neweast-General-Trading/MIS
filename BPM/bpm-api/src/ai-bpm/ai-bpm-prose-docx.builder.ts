import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  Table,
  Packer,
  TextRun,
  Document,
  TableRow,
  Paragraph,
  TableCell,
  ImageRun,
  Bookmark,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  ShadingType,
  VerticalAlign,
  TableOfContents,
  WidthType,
  NumberFormat,
  InternalHyperlink,
  ExternalHyperlink,
  type FileChild,
  type ParagraphChild,
} from 'docx';
import { estimatePageNumbers } from 'docx/layout';

import {
  embedMermaidDiagramsInMarkdown,
  polishMarkdownForWord,
} from './ai-bpm-mermaid-images';
import type { BpmDocumentJson } from './ai-bpm-document.types';
import {
  buildCoverPageFooter,
  buildDocumentFooter,
  buildDocumentHeader,
  companyLogoParagraph,
  emptyFirstPageHeader,
} from './ai-bpm-docx-branding';
import { inlineTextRuns, plainMarkdownText } from './ai-bpm-markdown-inline';
import { isSectionBreakLine } from './ai-bpm-markdown-normalize';
import {
  subProcessBookmarkId,
  type WordPolicyDocument,
} from './ai-bpm-policy-word.util';

const BRAND = '1F4E79';
const POLICY_ACCENT = 'ED1C24';
const POLICY_BORDER = 'E2E8F0';
const POLICY_FILL = 'F8FAFC';
const HEADER_FILL = '1F4E79';
const HEADER_TEXT = 'FFFFFF';
const ALT_ROW_FILL = 'E8F0FA';
const LABEL_FILL = 'F7FAFC';
const BORDER = { style: BorderStyle.SINGLE, size: 1, color: '8EAADB' };

type CoverMeta = BpmDocumentJson['cover'];

function borders() {
  return { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
}

function spacedParagraph(
  children: (TextRun | ImageRun)[],
  opts?: {
    heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel];
    alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
    before?: number;
    after?: number;
    line?: number;
  },
) {
  return new Paragraph({
    heading: opts?.heading,
    alignment: opts?.alignment,
    spacing: {
      before: opts?.before ?? 120,
      after: opts?.after ?? 240,
      line: opts?.line ?? 276,
    },
    children,
  });
}

function textPara(
  text: string,
  opts?: {
    heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel];
    alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
    bold?: boolean;
    italics?: boolean;
    size?: number;
    color?: string;
    before?: number;
    after?: number;
  },
) {
  const runs = inlineTextRuns(text, {
    bold: opts?.bold,
    italics: opts?.italics,
    size: opts?.size ?? 22,
    color: opts?.color,
  });
  return spacedParagraph(runs, opts);
}

function tableCell(
  text: string,
  opts?: { header?: boolean; labelCol?: boolean; alt?: boolean; widthPct?: number },
) {
  let fill: string | undefined;
  if (opts?.header) fill = HEADER_FILL;
  else if (opts?.labelCol) fill = LABEL_FILL;
  else if (opts?.alt) fill = ALT_ROW_FILL;
  const safe = String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\n+/g, ' · ')
    .replace(/\s+/g, ' ')
    .trim();

  return new TableCell({
    width: opts?.widthPct
      ? { size: opts.widthPct, type: WidthType.PERCENTAGE }
      : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    shading: fill ? { fill, type: ShadingType.CLEAR } : undefined,
    borders: borders(),
    children: [
      new Paragraph({
        spacing: { before: 40, after: 40 },
        children: inlineTextRuns(safe, {
          bold: Boolean(opts?.header || opts?.labelCol),
          color: opts?.header ? HEADER_TEXT : undefined,
          size: opts?.header ? 20 : 21,
        }),
      }),
    ],
  });
}

function markdownTable(headers: string[], rows: string[][]): Table {
  const cols = Math.max(headers.length, 1);
  const widthPct = Math.floor(100 / cols);
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    margins: { top: 200, bottom: 240 },
    rows: [
      new TableRow({
        children: headers.map((h) =>
          tableCell(h, { header: true, widthPct }),
        ),
      }),
      ...rows.map((row, ri) =>
        new TableRow({
          children: headers.map((_, ci) =>
            tableCell(row[ci] ?? '', {
              widthPct,
              alt: ri % 2 === 1,
              labelCol: ci === 0,
            }),
          ),
        }),
      ),
    ],
  });
}

function policySoftBorder() {
  const edge = { style: BorderStyle.SINGLE, size: 8, color: POLICY_BORDER };
  return { top: edge, bottom: edge, left: edge, right: edge };
}

/** Markdown `[label](url|#anchor)` → External/Internal hyperlink; rest as text runs. */
function paragraphChildrenWithLinks(
  text: string,
  style?: { size?: number; bold?: boolean; color?: string },
): ParagraphChild[] {
  const size = style?.size ?? 22;
  const out: ParagraphChild[] = [];
  const re = /\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      out.push(
        ...inlineTextRuns(text.slice(last, m.index), {
          size,
          bold: style?.bold,
          color: style?.color,
        }),
      );
    }
    const label = m[1];
    const target = m[2].trim();
    const run = new TextRun({
      text: label,
      size,
      bold: style?.bold ?? true,
      color: style?.color ?? '0563C1',
      underline: {},
    });
    if (target.startsWith('#')) {
      out.push(
        new InternalHyperlink({
          anchor: target.slice(1),
          children: [run],
        }),
      );
    } else if (/^https?:\/\//i.test(target)) {
      out.push(
        new ExternalHyperlink({
          link: target,
          children: [run],
        }),
      );
    } else {
      out.push(...inlineTextRuns(`[${label}](${target})`, { size }));
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    out.push(
      ...inlineTextRuns(text.slice(last), {
        size,
        bold: style?.bold,
        color: style?.color,
      }),
    );
  }
  if (!out.length && text) {
    out.push(
      ...inlineTextRuns(text, {
        size,
        bold: style?.bold,
        color: style?.color,
      }),
    );
  }
  return out;
}

function headingBookmarkId(title: string): string | null {
  const m = title.match(/^(\S+)\s+[—–\-]\s+/);
  if (m) return subProcessBookmarkId(m[1]);
  const numbered = title.match(/^(\d+(?:\.\d+)*)\.\s+/);
  if (numbered) {
    return `sec_${numbered[1].replace(/\./g, '_')}`;
  }
  return null;
}

/** Policy Creator print layout — card under the parent sub-process. */
function renderPolicyPrintCard(policy: WordPolicyDocument): FileChild[] {
  const out: FileChild[] = [];
  const metaParts = [
    policy.companyName,
    policy.departmentName,
    policy.version != null ? `Version ${policy.version}` : '',
  ].filter(Boolean);

  out.push(
    new Paragraph({
      spacing: { before: 280, after: 80 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 12, color: POLICY_ACCENT },
      },
      children: [
        new TextRun({
          text: 'RELATED POLICY',
          bold: true,
          size: 18,
          color: POLICY_ACCENT,
          font: 'Calibri',
        }),
      ],
    }),
  );

  out.push(
    textPara(policy.name, {
      bold: true,
      size: 26,
      color: '0F172A',
      before: 120,
      after: 80,
    }),
  );

  if (metaParts.length) {
    out.push(
      textPara(metaParts.join('  ·  '), {
        size: 18,
        color: '64748B',
        before: 40,
        after: 160,
      }),
    );
  }

  out.push(
    markdownTable(
      ['Field', 'Value'],
      [
        ['Company', policy.companyName || '—'],
        ['Department', policy.departmentName || '—'],
        ['Document Version', policy.version != null ? String(policy.version) : '—'],
      ],
    ),
  );

  if (policy.businessRole?.trim()) {
    // Policy Creator print: keep commas/newlines as stored.
    const ruleLines = policy.businessRole.replace(/\r\n/g, '\n').split('\n');
    out.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                borders: policySoftBorder(),
                shading: { fill: POLICY_FILL, type: ShadingType.CLEAR },
                margins: { top: 120, bottom: 120, left: 160, right: 160 },
                children: [
                  new Paragraph({
                    spacing: { after: 80 },
                    children: [
                      new TextRun({
                        text: 'Business Role',
                        bold: true,
                        size: 20,
                        color: '0F172A',
                        font: 'Calibri',
                      }),
                    ],
                  }),
                  ...ruleLines.map(
                    (line) =>
                      new Paragraph({
                        spacing: { after: line.trim() ? 60 : 80 },
                        children: [
                          new TextRun({
                            text: line,
                            size: 20,
                            color: '334155',
                            font: 'Calibri',
                          }),
                        ],
                      }),
                  ),
                ],
              }),
            ],
          }),
        ],
      }),
    );
    out.push(textPara('', { after: 120 }));
  }

  policy.sections.forEach((section, index) => {
    const num = String(index + 1).padStart(2, '0');
    out.push(
      new Paragraph({
        spacing: { before: 200, after: 100 },
        children: [
          new TextRun({
            text: num,
            bold: true,
            size: 18,
            color: POLICY_ACCENT,
            font: 'Calibri',
          }),
          new TextRun({
            text: '  ',
            size: 18,
          }),
          new TextRun({
            text: section.title,
            bold: true,
            size: 22,
            color: '0F172A',
            font: 'Calibri',
          }),
        ],
      }),
    );
    // Keep Policy Creator body letter-for-letter (commas, punctuation, line breaks).
    const body = (section.contentPlain || '—').replace(/\r\n/g, '\n');
    const lines = body.length ? body.split('\n') : ['—'];
    for (const line of lines) {
      out.push(
        new Paragraph({
          spacing: { before: 40, after: line.trim() ? 80 : 60 },
          children: [
            new TextRun({
              text: line,
              size: 20,
              color: '334155',
              font: 'Calibri',
            }),
          ],
        }),
      );
    }
  });

  out.push(
    new Paragraph({
      spacing: { before: 200, after: 280 },
      border: {
        top: { style: BorderStyle.SINGLE, size: 6, color: POLICY_BORDER },
      },
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: 'Confidential Policy Document · © NEWEAST',
          italics: true,
          size: 16,
          color: '94A3B8',
          font: 'Calibri',
        }),
      ],
    }),
  );

  return out;
}

function parseBpmPolicyFence(lines: string[], startIndex: number): {
  policy: WordPolicyDocument | null;
  nextIndex: number;
} {
  let i = startIndex + 1;
  const payload: string[] = [];
  while (i < lines.length && lines[i].trim() !== ':::') {
    payload.push(lines[i]);
    i += 1;
  }
  if (i < lines.length) i += 1;
  try {
    const policy = JSON.parse(payload.join('\n')) as WordPolicyDocument;
    if (!policy?.name) return { policy: null, nextIndex: i };
    return { policy, nextIndex: i };
  } catch {
    return { policy: null, nextIndex: i };
  }
}

async function buildCoverPage(
  cover: CoverMeta,
  generatedAt: string,
): Promise<FileChild[]> {
  const logo = await companyLogoParagraph();
  const coverDate =
    generatedAt.length <= 10 ? generatedAt : generatedAt.slice(0, 10);

  return [
    ...(logo ? [logo] : []),
    ...(logo
      ? []
      : [
          textPara('NEW EAST', {
            alignment: AlignmentType.CENTER,
            bold: true,
            size: 32,
            color: BRAND,
            before: 800,
            after: 200,
          }),
        ]),
    textPara(cover.title, {
      alignment: AlignmentType.CENTER,
      bold: true,
      size: 44,
      color: BRAND,
      after: 180,
    }),
    ...(cover.subtitle
      ? [
          textPara(cover.subtitle, {
            alignment: AlignmentType.CENTER,
            italics: true,
            size: 26,
            after: 360,
          }),
        ]
      : [textPara('', { after: 360 })]),
    markdownTable(
      ['Field', 'Value'],
      [
        ['Process function', `${cover.processFunction} (${cover.processFunctionCode})`],
        ['Process target', cover.processTarget],
        ['Company', cover.companyCode || '—'],
        ['Document version', cover.documentVersion || '1.0'],
        ['Classification', cover.confidentiality || 'Internal'],
        ['Generated (UTC)', coverDate],
        ['Prepared by', 'BPM-SAP · Automation-assisted generation'],
      ],
    ),
    textPara('', { after: 200 }),
    textPara('Business Process Management — Automated Document', {
      alignment: AlignmentType.CENTER,
      italics: true,
      size: 20,
      after: 120,
    }),
    textPara(
      'Generated from live BPM data with Claude-assisted narrative. Comments and discussion threads were excluded.',
      { alignment: AlignmentType.CENTER, italics: true, size: 20, after: 480 },
    ),
  ];
}

function parseTableBlock(lines: string[]): { headers: string[]; rows: string[][] } | null {
  const tableLines = lines.filter((l) => l.trim().startsWith('|'));
  if (tableLines.length < 2) return null;

  const splitRow = (line: string) =>
    line
      .split('|')
      .slice(1, -1)
      .map((c) => c.replace(/\s+/g, ' ').trim());

  const headers = splitRow(tableLines[0]);
  const rows = tableLines
    .slice(2)
    .filter((l) => !l.match(/^\|[\s-:|]+\|$/))
    .map(splitRow);

  return { headers, rows };
}

function pngPixelSize(data: Buffer): { width: number; height: number } | null {
  if (data.length < 24) return null;
  if (data.toString('ascii', 1, 4) !== 'PNG') return null;
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

async function imageParagraph(
  assetsDir: string,
  fileName: string,
  alt: string,
): Promise<Paragraph> {
  try {
    const data = await readFile(join(assetsDir, fileName));
    const size = pngPixelSize(data);
    const maxWidth = 620;
    const maxHeight = 860;
    let width = maxWidth;
    let height = 420;
    if (size && size.width > 0 && size.height > 0) {
      const scale = Math.min(maxWidth / size.width, maxHeight / size.height);
      width = Math.max(280, Math.round(size.width * scale));
      height = Math.max(180, Math.round(size.height * scale));
    }
    return spacedParagraph(
      [
        new ImageRun({
          data,
          type: fileName.endsWith('.png') ? 'png' : 'jpg',
          transformation: { width, height },
        }),
      ],
      { alignment: AlignmentType.CENTER, before: 240, after: 320 },
    );
  } catch {
    return textPara(alt, { italics: true, after: 200 });
  }
}

function stripLeadingTitlePage(markdown: string): string {
  const lines = markdown.split('\n');
  let start = 0;
  if (lines[0]?.match(/^#\s+/)) {
    start = 1;
    while (start < lines.length && !lines[start]?.trim()) start += 1;
  }
  return lines.slice(start).join('\n');
}

async function markdownBodyToDocx(
  markdown: string,
  assetsDir: string,
): Promise<FileChild[]> {
  const out: FileChild[] = [];
  const lines = markdown.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (isSectionBreakLine(trimmed)) {
      out.push(
        new Paragraph({
          spacing: { before: 240, after: 240 },
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 6, color: BRAND },
          },
          children: [],
        }),
      );
      i += 1;
      continue;
    }

    const img = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (img) {
      out.push(await imageParagraph(assetsDir, img[2], img[1] || 'Diagram'));
      i += 1;
      continue;
    }

    if (trimmed.startsWith('|')) {
      const block: string[] = [];
      while (i < lines.length) {
        const current = lines[i];
        const currentTrim = current.trim();
        if (currentTrim.startsWith('|')) {
          block.push(current);
          i += 1;
          continue;
        }
        // Continuation of a cell that contained a raw newline — keep it in the table.
        if (
          block.length > 0 &&
          currentTrim &&
          !currentTrim.startsWith('#') &&
          !currentTrim.startsWith('```') &&
          !currentTrim.startsWith('![') &&
          !currentTrim.startsWith('- ') &&
          !/^\d+\.\s+/.test(currentTrim)
        ) {
          const last = block.length - 1;
          block[last] = block[last].replace(/\s*\|\s*$/, ` · ${currentTrim} |`);
          i += 1;
          continue;
        }
        break;
      }
      const table = parseTableBlock(block);
      if (table && table.headers.length > 0) {
        out.push(textPara('', { before: 200, after: 100 }));
        out.push(markdownTable(table.headers, table.rows));
        out.push(textPara('', { after: 280 }));
      }
      continue;
    }

    if (trimmed === ':::bpm-policy') {
      const parsed = parseBpmPolicyFence(lines, i);
      if (parsed.policy) {
        out.push(...renderPolicyPrintCard(parsed.policy));
      }
      i = parsed.nextIndex;
      continue;
    }

    // Orphan fence closer from a skipped/invalid policy block.
    if (trimmed === ':::') {
      i += 1;
      continue;
    }

    const h1 = trimmed.match(/^#\s+(.+)/);
    const h2 = trimmed.match(/^##\s+(.+)/);
    const h3 = trimmed.match(/^###\s+(.+)/);
    const h4 = trimmed.match(/^####\s+(.+)/);
    if (h1 || h2 || h3 || h4) {
      const text = plainMarkdownText((h1 ?? h2 ?? h3 ?? h4)![1]);
      const isRelatedHeading =
        /^integrated sub-process$/i.test(text) ||
        /^related sub-process$/i.test(text) ||
        /^related policy\b/i.test(text) ||
        /linked related sub-processes/i.test(text) ||
        /related policy for this sub-process/i.test(text);
      if (h4 || isRelatedHeading) {
        out.push(
          new Paragraph({
            spacing: { before: 240, after: 120 },
            border: {
              left: {
                style: BorderStyle.SINGLE,
                size: 24,
                color: isRelatedHeading ? POLICY_ACCENT : BRAND,
                space: 8,
              },
            },
            indent: { left: 120 },
            children: [
              new TextRun({
                text,
                bold: true,
                size: 22,
                color: isRelatedHeading ? POLICY_ACCENT : BRAND,
                font: 'Calibri',
              }),
            ],
          }),
        );
        i += 1;
        continue;
      }
      const level = h1
        ? HeadingLevel.HEADING_1
        : h3
          ? HeadingLevel.HEADING_3
          : HeadingLevel.HEADING_2;
      const bookmarkId = headingBookmarkId(text);
      out.push(
        new Paragraph({
          heading: level,
          spacing: {
            before: level === HeadingLevel.HEADING_1 ? 400 : 280,
            after: level === HeadingLevel.HEADING_1 ? 220 : 180,
            line: 276,
          },
          children: bookmarkId
            ? [
                new Bookmark({
                  id: bookmarkId,
                  children: inlineTextRuns(text, {
                    bold: true,
                    size: level === HeadingLevel.HEADING_1 ? 32 : level === HeadingLevel.HEADING_3 ? 24 : 28,
                    color: level === HeadingLevel.HEADING_3 ? '2C3E50' : BRAND,
                  }),
                }),
              ]
            : inlineTextRuns(text, {
                bold: true,
                size: level === HeadingLevel.HEADING_1 ? 32 : level === HeadingLevel.HEADING_3 ? 24 : 28,
                color: level === HeadingLevel.HEADING_3 ? '2C3E50' : BRAND,
              }),
        }),
      );
      i += 1;
      continue;
    }

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      while (
        i < lines.length &&
        (lines[i].trim().startsWith('- ') || lines[i].trim().startsWith('* '))
      ) {
        const item = lines[i].trim().replace(/^[-*]\s+/, '');
        out.push(
          new Paragraph({
            bullet: { level: 0 },
            spacing: { before: 80, after: 120 },
            children: paragraphChildrenWithLinks(item, { size: 22 }),
          }),
        );
        i += 1;
      }
      out.push(textPara('', { after: 160 }));
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        const item = lines[i].trim().replace(/^\d+\.\s+/, '');
        out.push(
          new Paragraph({
            numbering: { reference: 'bpm-numbered', level: 0 },
            spacing: { before: 80, after: 120 },
            children: inlineTextRuns(item, { size: 22 }),
          }),
        );
        i += 1;
      }
      out.push(textPara('', { after: 160 }));
      continue;
    }

    // Skip leftover fenced code (mermaid already embedded as images).
    if (trimmed.startsWith('```')) {
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) i += 1;
      if (i < lines.length) i += 1;
      continue;
    }

    const paraLines: string[] = [trimmed];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith('|') &&
      !lines[i].trim().startsWith('#') &&
      !lines[i].trim().startsWith('- ') &&
      !lines[i].trim().startsWith('* ') &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith('![') &&
      !lines[i].trim().startsWith('```')
    ) {
      paraLines.push(lines[i].trim());
      i += 1;
    }
    out.push(textPara(paraLines.join(' '), { after: 220 }));
  }

  return out;
}

export async function buildProseWordDocxBuffer(opts: {
  markdown: string;
  cover: CoverMeta;
  generatedAt: string;
  docxFilename: string;
}): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'bpm-ai-word-'));
  try {
    const polished = polishMarkdownForWord(opts.markdown);
    const { markdown: withImages } = await embedMermaidDiagramsInMarkdown(
      polished,
      dir,
    );
    const bodyMarkdown = stripLeadingTitlePage(withImages);
    const generatedAt = opts.generatedAt;
    const body = await markdownBodyToDocx(bodyMarkdown, dir);
    const coverChildren = await buildCoverPage(opts.cover, generatedAt);
    const footer = buildDocumentFooter(opts.docxFilename, generatedAt);
    const coverFooter = buildCoverPageFooter(opts.docxFilename, generatedAt);
    const header = await buildDocumentHeader();

    const doc = new Document({
      // Layout-estimated TOC/page refs — interactive + correct pages without Word prompt
      pageNumbers: estimatePageNumbers,
      numbering: {
        config: [
          {
            reference: 'bpm-numbered',
            levels: [
              {
                level: 0,
                format: 'decimal',
                text: '%1.',
                alignment: AlignmentType.LEFT,
                style: {
                  paragraph: {
                    indent: { left: 720, hanging: 360 },
                  },
                },
              },
            ],
          },
        ],
      },
      styles: {
        default: {
          document: {
            run: { font: 'Calibri', size: 22 },
          },
        },
        paragraphStyles: [
          {
            id: 'Heading1',
            name: 'Heading 1',
            basedOn: 'Normal',
            next: 'Normal',
            quickFormat: true,
            run: { size: 32, bold: true, color: BRAND, font: 'Calibri' },
            paragraph: { spacing: { before: 400, after: 220 } },
          },
          {
            id: 'Heading2',
            name: 'Heading 2',
            basedOn: 'Normal',
            next: 'Normal',
            quickFormat: true,
            run: { size: 28, bold: true, color: BRAND, font: 'Calibri' },
            paragraph: { spacing: { before: 280, after: 180 } },
          },
          {
            id: 'Heading3',
            name: 'Heading 3',
            basedOn: 'Normal',
            next: 'Normal',
            quickFormat: true,
            run: { size: 24, bold: true, color: '2C3E50', font: 'Calibri' },
            paragraph: { spacing: { before: 220, after: 140 } },
          },
        ],
      },
      sections: [
        // Cover — no page numbers (does not inflate body/TOC counts)
        {
          properties: {
            page: {
              margin: {
                top: 1800,
                right: 1440,
                bottom: 1600,
                left: 1440,
                header: 720,
                footer: 720,
              },
            },
          },
          headers: { default: emptyFirstPageHeader() },
          footers: { default: coverFooter },
          children: coverChildren,
        },
        // TOC — roman i, ii… so body can restart at arabic 1
        {
          properties: {
            page: {
              pageNumbers: { start: 1, formatType: NumberFormat.LOWER_ROMAN },
              margin: {
                top: 1800,
                right: 1440,
                bottom: 1600,
                left: 1440,
                header: 720,
                footer: 720,
              },
            },
          },
          headers: { default: header },
          footers: { default: footer },
          children: [
            textPara('Table of Contents', {
              alignment: AlignmentType.CENTER,
              bold: true,
              size: 32,
              color: BRAND,
              before: 280,
              after: 360,
            }),
            new TableOfContents('Table of contents', {
              hyperlink: true,
              headingStyleRange: '1-3',
            }),
          ],
        },
        // Body — arabic page 1 = first content page (TOC field refs match)
        {
          properties: {
            page: {
              pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL },
              margin: {
                top: 1800,
                right: 1440,
                bottom: 1600,
                left: 1440,
                header: 720,
                footer: 720,
              },
            },
          },
          headers: { default: header },
          footers: { default: footer },
          children: body,
        },
      ],
    });

    return Packer.toBuffer(doc);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
