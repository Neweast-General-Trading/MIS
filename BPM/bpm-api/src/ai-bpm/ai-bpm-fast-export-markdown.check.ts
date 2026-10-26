/**
 * ponytail: assert-based self-check for Claude §5 analysis injection.
 * Run: npx ts-node --transpile-only src/ai-bpm/ai-bpm-fast-export-markdown.check.ts
 */
import {
  assembleFastExportMarkdown,
  extractSubProcessAnalyses,
} from './ai-bpm-fast-export-markdown';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const analyses = extractSubProcessAnalyses(`## 5. Sub-process analysis

### SP-01 — Intake
Receives the request. R is Clerk. System field empty.

### SP-02 — Review
Approver checks completeness. TAT missing.

## 7.1 End-to-end process flow
ignore me
`);

assert(analyses.get('SP-01')?.includes('Receives the request'), 'SP-01 prose');
assert(analyses.get('SP-02')?.includes('Approver checks'), 'SP-02 prose');
assert(!analyses.has('7.1'), 'must not latch flow heading');

const md = assembleFastExportMarkdown({
  processCode: 'P1',
  processName: 'Demo',
  subProcesses: [
    {
      sln: 1,
      code: 'SP-01',
      activityName: 'Intake',
      activityDescription: 'desc',
      status: 'Active',
      owners: ['Clerk'],
      parentCode: 'P1',
      details: {},
    },
    {
      sln: 2,
      code: 'SP-02',
      activityName: 'Review',
      activityDescription: 'desc2',
      status: 'Active',
      owners: ['Manager'],
      parentCode: 'P1',
      details: {},
    },
  ],
  claudeNarrativeMarkdown: `## 2. Executive summary

Two steps.

## 3. Process overview

Demo process.

## 5. Sub-process analysis

### SP-01 — Intake
Receives the request from the requester.

### SP-02 — Review
Manager validates the packet.

## 7.1 End-to-end process flow

\`\`\`mermaid
flowchart LR
  A[SP-01] --> B[SP-02]
\`\`\`

## 8. Gaps and observations

- TAT empty
`,
});

assert(md.includes('Receives the request from the requester.'), 'inject SP-01');
assert(md.includes('Manager validates the packet.'), 'inject SP-02');
const idxTitle = md.indexOf('### SP-01 — Intake');
const idxProse = md.indexOf('Receives the request from the requester.');
const idxTable = md.indexOf('| Field | Value |', idxTitle);
assert(idxTitle < idxProse && idxProse < idxTable, 'order: title → prose → table');

// Missing Claude block → fallback still present; Description from details when column empty.
const md2 = assembleFastExportMarkdown({
  processCode: 'P2',
  processName: 'Stock',
  subProcesses: [
    {
      sln: 1,
      code: '003-002-002-000',
      activityName: 'Validate Stock Availability',
      activityDescription: '',
      status: 'Draft',
      owners: [],
      details: {
        Description: 'Validate available quantity before quotation.',
        'Goal / Objective Of The Process': 'Stock information will be displayed',
        Data: 'Customer Type · Material · Quantity',
        Responsible: 'Sales Person',
      },
    },
  ],
  claudeNarrativeMarkdown: `## 2. Executive summary

One step.

## 3. Process overview

—

## 8. Gaps and observations

- empty
`,
});
assert(
  md2.includes('Validate available quantity before quotation.'),
  'description from details + fallback analysis',
);
assert(md2.includes('| Description | Validate available quantity before quotation. |'), 'description cell');
assert(md2.includes('### 003-002-002-000 — Validate Stock Availability'), 'heading');

// Template labels folded into core register (Activity Name → Name, Si No → SLN)
// must NOT trigger Completeness supplement / duplicate Field|Value tables.
const md3 = assembleFastExportMarkdown({
  processCode: 'P3',
  processName: 'Ops',
  templateColumns: [
    { key: 'activityName', label: 'Activity Name' },
    { key: 'sln', label: 'Si No' },
    { key: 'TAT', label: 'TAT' },
  ],
  subProcesses: [
    {
      sln: 1,
      code: '002-001-001',
      activityName: 'Inbound',
      activityDescription: 'Receive goods',
      status: 'Active',
      owners: ['Clerk'],
      parentCode: 'P3',
      details: { TAT: '2' },
    },
    {
      sln: 2,
      code: '002-001-002',
      activityName: 'QC',
      activityDescription: 'Quality check',
      status: 'Active',
      owners: ['QC'],
      parentCode: 'P3',
      details: { TAT: '1' },
    },
  ],
  claudeNarrativeMarkdown: `## 2. Executive summary

Two steps.

## 3. Process overview

Ops.

## 8. Gaps and observations

- none
`,
});
assert(!md3.includes('## Completeness supplement'), 'no false completeness dump');
const headingHits = md3.split('### 002-001-001 — Inbound').length - 1;
assert(headingHits === 1, `SP heading once, got ${headingHits}`);
const spHeadings = (md3.match(/^### \d{3}-/gm) ?? []).length;
assert(spHeadings === 2, `exactly 2 SP section headings, got ${spHeadings}`);

console.log('ai-bpm-fast-export-markdown.check: ok');
