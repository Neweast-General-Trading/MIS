import {
  Table,
  Packer,
  TextRun,
  Document,
  TableRow,
  Paragraph,
  TableCell,
  WidthType,
  HeadingLevel,
  AlignmentType,
} from 'docx';

import {
  BPMN_NOTES,
  RACI_ROLES,
  type RaciRow,
  PROCESS_SCOPE,
  SUB_PROCESSES,
  PROCESS_PURPOSE,
  SWIMLANE_MATRIX,
  SWIMLANE_PHASES,
  MASTER_RACI_ROWS,
  PROCESS_TRIGGERS,
  RACI_ROLE_SHORT_LABELS,
  DAILY_INBOUND_PROCESS_CODE,
  DAILY_INBOUND_PROCESS_NAME,
} from './daily-inbound-plan.content';

export const DAILY_INBOUND_DOCX_FILENAME = `${DAILY_INBOUND_PROCESS_CODE}_${DAILY_INBOUND_PROCESS_NAME.replace(/\s+/g, '_')}_BPM.docx`;

function p(text: string, opts?: { bold?: boolean; italics?: boolean; heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel] }) {
  return new Paragraph({
    heading: opts?.heading,
    alignment: AlignmentType.LEFT,
    children: [
      new TextRun({
        text,
        bold: opts?.bold,
        italics: opts?.italics,
      }),
    ],
    spacing: { after: 120 },
  });
}

function bullet(items: string[]) {
  return items.map(
    (line) =>
      new Paragraph({
        bullet: { level: 0 },
        children: [new TextRun(line)],
        spacing: { after: 80 },
      }),
  );
}

function raciTable(rows: RaciRow[]): Table {
  const headerCells = [
    new TableCell({
      width: { size: 10, type: WidthType.PERCENTAGE },
      children: [new Paragraph({ children: [new TextRun({ text: 'ID', bold: true })] })],
    }),
    new TableCell({
      width: { size: 34, type: WidthType.PERCENTAGE },
      children: [new Paragraph({ children: [new TextRun({ text: 'Step', bold: true })] })],
    }),
    ...RACI_ROLE_SHORT_LABELS.map(
      (label) =>
        new TableCell({
          width: { size: 8, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: label, bold: true })] })],
        }),
    ),
  ];

  const bodyRows = rows.map((row) => {
    const cells = [
      new TableCell({
        children: [new Paragraph({ children: [new TextRun(row.stepId)] })],
      }),
      new TableCell({
        children: [new Paragraph({ children: [new TextRun(row.stepName)] })],
      }),
      ...RACI_ROLES.map((role) =>
        new TableCell({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun(row.raci[role])],
            }),
          ],
        }),
      ),
    ];
    return new TableRow({ children: cells });
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ children: headerCells }), ...bodyRows],
  });
}

function swimlaneTable(): Table {
  const headerCells = [
    new TableCell({
      width: { size: 18, type: WidthType.PERCENTAGE },
      children: [new Paragraph({ children: [new TextRun({ text: 'Swimlane (pool/lane)', bold: true })] })],
    }),
    ...SWIMLANE_PHASES.map(
      (ph) =>
        new TableCell({
          width: { size: 16.4, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text: ph, bold: true })] })],
        }),
    ),
  ];

  const rows = SWIMLANE_MATRIX.map((row) => {
    const cells = [
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: row.lane, bold: true })] })],
      }),
      ...row.cells.map(
        (cell) =>
          new TableCell({
            children: [new Paragraph({ children: [new TextRun(cell.replace(/\n/g, ' · '))] })],
          }),
      ),
    ];
    return new TableRow({ children: cells });
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ children: headerCells }), ...rows],
  });
}

export function buildDailyInboundPlanDocx(): Document {
  const children: (Paragraph | Table)[] = [
    p(`${DAILY_INBOUND_PROCESS_CODE} — ${DAILY_INBOUND_PROCESS_NAME}`, {
      heading: HeadingLevel.TITLE,
      bold: true,
    }),
    p('Business process description — BPMN swimlanes & RACI (static packaged artefact)', {
      italics: true,
    }),
    p(`Generated: ${new Date().toISOString().slice(0, 10)} (UTC)`),

    p('1. Purpose', { heading: HeadingLevel.HEADING_1 }),
    p(PROCESS_PURPOSE),

    p('2. Scope', { heading: HeadingLevel.HEADING_1 }),
    p(PROCESS_SCOPE),

    p('3. Triggers', { heading: HeadingLevel.HEADING_1 }),
    ...bullet(PROCESS_TRIGGERS),

    p('4. BPMN swimlane flow (tabular view)', { heading: HeadingLevel.HEADING_1 }),
    p(
      'Each row is a lane; columns follow chronological phases left-to-right. Tasks/events use BPMN terminology in plain language.',
    ),
    swimlaneTable(),
    ...bullet(BPMN_NOTES),

    p('5. Master RACI (end-to-end steps)', { heading: HeadingLevel.HEADING_1 }),
    p(
      `Legend — columns map to roles: ${RACI_ROLE_SHORT_LABELS.map((s, i) => `${s}=${RACI_ROLES[i]}`).join('; ')}. Symbols: R=Responsible, A=Accountable, C=Consulted, I=Informed, —=not applicable.`,
    ),
    raciTable(MASTER_RACI_ROWS),

    p('6. Sub-process catalogue', { heading: HeadingLevel.HEADING_1 }),
    ...SUB_PROCESSES.flatMap((sp) => {
      const block: (Paragraph | Table)[] = [
        p(`${sp.code} ${sp.title}`, { heading: HeadingLevel.HEADING_2 }),
        p('Objective', { bold: true }),
        p(sp.objective),
        p('Inputs', { bold: true }),
        ...bullet(sp.inputs),
        p('Outputs', { bold: true }),
        ...bullet(sp.outputs),
        p('KPIs', { bold: true }),
        ...bullet(sp.kpis),
        p('Procedure steps', { bold: true }),
        ...bullet(sp.steps.map((s) => `${s.id}: ${s.text}`)),
        p('RACI for sub-process steps', { bold: true }),
        raciTable(sp.raci),
      ];
      return block;
    }),

    p('7. Revision & governance', { heading: HeadingLevel.HEADING_1 }),
    p(
      'Maintain this document under document control: owner = Process Owner for the relevant Process Function; review at least annually or when regulations / systems materially change.',
    ),
  ];

  return new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });
}

export async function buildDailyInboundPlanDocxBlob(): Promise<Blob> {
  const doc = buildDailyInboundPlanDocx();
  return Packer.toBlob(doc);
}
