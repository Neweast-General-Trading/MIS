import {
  Table,
  WidthType,
  Packer,
  Header,
  Document,
  TableRow,
  Paragraph,
  TableCell,
  PageBreak,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  ShadingType,
  VerticalAlign,
  TableOfContents,
  type FileChild,
} from 'docx';
import { estimatePageNumbers } from 'docx/layout';

import type {
  BpmDocBlock,
  BpmDocSection,
  BpmDocumentJson,
} from './ai-bpm-document.types';
import {
  buildCoverPageFooter,
  buildDocumentFooter,
  buildDocumentHeader,
  companyLogoParagraph,
  emptyFirstPageHeader,
} from './ai-bpm-docx-branding';
import { inlineTextRuns } from './ai-bpm-markdown-inline';

const HEADER_FILL = '1F4E79';
const HEADER_TEXT = 'FFFFFF';
const ALT_ROW_FILL = 'F2F6FA';
const TABLE_BORDER = { style: BorderStyle.SINGLE, size: 1, color: 'B4C6E7' };

function cellBorders() {
  return {
    top: TABLE_BORDER,
    bottom: TABLE_BORDER,
    left: TABLE_BORDER,
    right: TABLE_BORDER,
  };
}

function paragraph(
  text: string,
  opts?: {
    bold?: boolean;
    italics?: boolean;
    heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel];
    alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
    sizeHalfPoints?: number;
    color?: string;
  },
) {
  return new Paragraph({
    heading: opts?.heading,
    alignment: opts?.alignment ?? AlignmentType.LEFT,
    spacing: { after: 160, line: 276 },
    children: inlineTextRuns(text, {
      bold: opts?.bold,
      italics: opts?.italics,
      size: opts?.sizeHalfPoints ?? 22,
      color: opts?.color,
    }),
  });
}

function bullets(items: string[]) {
  return items.map(
    (line) =>
      new Paragraph({
        bullet: { level: 0 },
        spacing: { after: 80 },
        children: inlineTextRuns(line, { size: 22 }),
      }),
  );
}

function tableCell(
  text: string,
  opts?: {
    header?: boolean;
    widthPct?: number;
    center?: boolean;
    altRow?: boolean;
  },
) {
  return new TableCell({
    width: opts?.widthPct
      ? { size: opts.widthPct, type: WidthType.PERCENTAGE }
      : undefined,
    verticalAlign: VerticalAlign.CENTER,
    shading: opts?.header
      ? { fill: HEADER_FILL, type: ShadingType.CLEAR }
      : opts?.altRow
        ? { fill: ALT_ROW_FILL, type: ShadingType.CLEAR }
        : undefined,
    borders: cellBorders(),
    children: [
      new Paragraph({
        alignment: opts?.center ? AlignmentType.CENTER : AlignmentType.LEFT,
        children: inlineTextRuns(text, {
          bold: opts?.header,
          color: opts?.header ? HEADER_TEXT : undefined,
          size: opts?.header ? 20 : 22,
        }),
      }),
    ],
  });
}

function dataTable(headers: string[], rows: string[][]): Table {
  const colCount = Math.max(headers.length, 1);
  const widthPct = Math.floor(100 / colCount);
  const headerRow = new TableRow({
    children: headers.map((h) =>
      tableCell(h, { header: true, widthPct, center: colCount <= 6 }),
    ),
  });
  const bodyRows = rows.map(
    (row, rowIndex) =>
      new TableRow({
        children: headers.map((_, colIndex) => {
          const value = row[colIndex] ?? '';
          return tableCell(value, {
            widthPct,
            altRow: rowIndex % 2 === 1,
          });
        }),
      }),
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...bodyRows],
  });
}

function raciTable(
  rows: Array<{
    stepId: string;
    stepName: string;
    r: string;
    a: string;
    c: string;
    i: string;
    notes?: string;
  }>,
): Table {
  const headers = ['ID', 'Step', 'R', 'A', 'C', 'I', 'Notes'];
  const body = rows.map((row) => [
    row.stepId,
    row.stepName,
    row.r,
    row.a,
    row.c,
    row.i,
    row.notes ?? '',
  ]);
  return dataTable(headers, body);
}

function swimlaneTable(
  phases: string[],
  lanes: Array<{ lane: string; cells: string[] }>,
): Table {
  const headers = ['Swimlane (role)', ...phases];
  const rows = lanes.map((lane) => [
    lane.lane,
    ...phases.map((_, i) => lane.cells[i] ?? '—'),
  ]);
  return dataTable(headers, rows);
}

function blockToDocx(block: BpmDocBlock): (Paragraph | Table)[] {
  switch (block.type) {
    case 'paragraph':
      return [paragraph(block.text)];
    case 'bullets':
      return bullets(block.items);
    case 'table':
      return [
        paragraph(''),
        dataTable(block.headers, block.rows),
        paragraph(''),
      ];
    case 'raciTable':
      return [
        paragraph(
          'Legend: R = Responsible, A = Accountable, C = Consulted, I = Informed.',
          { italics: true, sizeHalfPoints: 20 },
        ),
        raciTable(block.rows),
        paragraph(''),
      ];
    case 'swimlaneTable':
      return [
        paragraph(
          'BPMN swimlane flow (tabular). Each row is a lane; columns are chronological phases.',
          { italics: true, sizeHalfPoints: 20 },
        ),
        swimlaneTable(block.phases, block.lanes),
        paragraph(''),
      ];
    default:
      return [];
  }
}

function sectionHeading(section: BpmDocSection): Paragraph {
  const level = section.level ?? 1;
  const heading =
    level === 1
      ? HeadingLevel.HEADING_1
      : level === 2
        ? HeadingLevel.HEADING_2
        : HeadingLevel.HEADING_3;
  return paragraph(section.heading, { heading, bold: true });
}

function buildCover(
  cover: BpmDocumentJson['cover'],
  generatedAt: string,
  logo?: Paragraph,
) {
  const coverDate =
    generatedAt.length <= 10 ? generatedAt : generatedAt.slice(0, 10);

  return [
    ...(logo ? [logo] : []),
    ...(logo
      ? [paragraph('')]
      : [
          paragraph('NEW EAST', {
            bold: true,
            sizeHalfPoints: 28,
            color: HEADER_FILL,
          }),
        ]),
    paragraph(cover.title, {
      heading: HeadingLevel.TITLE,
      bold: true,
      sizeHalfPoints: 36,
    }),
    ...(cover.subtitle
      ? [paragraph(cover.subtitle, { italics: true, sizeHalfPoints: 24 })]
      : []),
    paragraph(''),
    dataTable(
      ['Field', 'Value'],
      [
        [
          'Process function',
          `${cover.processFunction} (${cover.processFunctionCode})`,
        ],
        ['Process target', cover.processTarget],
        ['Company', cover.companyCode || '—'],
        ['Document version', cover.documentVersion || '1.0'],
        ['Classification', cover.confidentiality || 'Internal'],
        ['Generated (UTC)', coverDate],
        ['Prepared by', 'BPM-SAP · Automation-assisted generation'],
      ],
    ),
    paragraph(''),
    paragraph(
      'This document was generated from live BPM data. Comments and discussion threads were excluded. Validate assumptions before external distribution.',
      { italics: true, sizeHalfPoints: 20 },
    ),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

export function buildBpmDocumentDocx(
  documentJson: BpmDocumentJson,
  generatedAt: string,
  docxFilename: string,
  logo: Paragraph | undefined,
  header: Header,
): Document {
  const footer = buildDocumentFooter(docxFilename, generatedAt);
  const children: FileChild[] = [
    ...buildCover(documentJson.cover, generatedAt, logo),
    paragraph('Table of Contents', {
      alignment: AlignmentType.CENTER,
      bold: true,
      sizeHalfPoints: 32,
      color: HEADER_FILL,
    }),
    new TableOfContents('Table of contents', {
      hyperlink: true,
      headingStyleRange: '1-3',
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ];

  for (const section of documentJson.sections) {
    children.push(sectionHeading(section));
    for (const block of section.content) {
      children.push(...blockToDocx(block));
    }
  }

  children.push(
    paragraph('— End of document —', {
      alignment: AlignmentType.CENTER,
      italics: true,
      sizeHalfPoints: 20,
    }),
  );

  const coverFooter = buildCoverPageFooter(docxFilename, generatedAt);

  return new Document({
    pageNumbers: estimatePageNumbers,
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 22 },
        },
      },
    },
    sections: [
      {
        properties: {
          titlePage: true,
          page: {
            margin: {
              top: 1800,
              right: 1260,
              bottom: 1600,
              left: 1260,
              header: 720,
              footer: 720,
            },
          },
        },
        headers: {
          first: emptyFirstPageHeader(),
          default: header,
        },
        footers: {
          first: coverFooter,
          default: footer,
        },
        children,
      },
    ],
  });
}

export async function buildBpmDocumentDocxBuffer(
  documentJson: BpmDocumentJson,
  generatedAt: string,
  docxFilename: string,
): Promise<Buffer> {
  const logo = await companyLogoParagraph();
  const header = await buildDocumentHeader();
  const doc = buildBpmDocumentDocx(
    documentJson,
    generatedAt,
    docxFilename,
    logo ?? undefined,
    header,
  );
  return Packer.toBuffer(doc);
}

export function buildDocxFilename(
  departmentCode: string,
  processCode: string | null,
): string {
  const base = processCode
    ? `${departmentCode}_${processCode}`
    : `${departmentCode}_ALL-PROCESSES`;
  return `${base.replace(/[^\w.-]+/g, '_')}_BPM.docx`;
}
