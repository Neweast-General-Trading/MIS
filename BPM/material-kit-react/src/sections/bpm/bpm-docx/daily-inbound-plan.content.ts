/** Static BPM documentation for process 002-001-002-000 — no database reads. */

export const DAILY_INBOUND_PROCESS_CODE = '002-001-002-000';
export const DAILY_INBOUND_PROCESS_NAME = 'Daily Inbound Plan';

export const RACI_ROLES = [
  'Inbound Planning Lead',
  'Warehouse Supervisor',
  'Transport / Carrier Coordinator',
  'Dock / Yard Controller',
  'WMS / Inventory Analyst',
  'QA / QC Representative',
  'IT / Systems (ERP/WMS)',
] as const;

/** Short column headings for Word tables (legend spelled out in the document). */
export const RACI_ROLE_SHORT_LABELS = ['IPL', 'WS', 'TCC', 'DYC', 'WIA', 'QA', 'IT'] as const;

export type RaciLetter = 'R' | 'A' | 'C' | 'I' | '—';

export type RaciRow = {
  stepId: string;
  stepName: string;
  raci: Record<(typeof RACI_ROLES)[number], RaciLetter>;
};

/** End-to-end flow steps (level used in master RACI). */
export const MASTER_RACI_ROWS: RaciRow[] = [
  {
    stepId: 'S01',
    stepName: 'Collect inbound signals (PO, ASN, manual orders, slot requests)',
    raci: {
      'Inbound Planning Lead': 'A',
      'Warehouse Supervisor': 'C',
      'Transport / Carrier Coordinator': 'C',
      'Dock / Yard Controller': 'C',
      'WMS / Inventory Analyst': 'R',
      'QA / QC Representative': 'I',
      'IT / Systems (ERP/WMS)': 'C',
    },
  },
  {
    stepId: 'S02',
    stepName: 'Validate master data & cut-off rules (SKU, vendor, receiving calendar)',
    raci: {
      'Inbound Planning Lead': 'A',
      'Warehouse Supervisor': 'C',
      'Transport / Carrier Coordinator': 'I',
      'Dock / Yard Controller': 'I',
      'WMS / Inventory Analyst': 'R',
      'QA / QC Representative': 'C',
      'IT / Systems (ERP/WMS)': 'C',
    },
  },
  {
    stepId: 'S03',
    stepName: 'Simulate dock doors, labour, MHE and staging capacity for the shift/day',
    raci: {
      'Inbound Planning Lead': 'A',
      'Warehouse Supervisor': 'R',
      'Transport / Carrier Coordinator': 'C',
      'Dock / Yard Controller': 'R',
      'WMS / Inventory Analyst': 'C',
      'QA / QC Representative': 'I',
      'IT / Systems (ERP/WMS)': 'I',
    },
  },
  {
    stepId: 'S04',
    stepName: 'Resolve conflicts (overload, priority SKU, temperature lane, bonded moves)',
    raci: {
      'Inbound Planning Lead': 'A',
      'Warehouse Supervisor': 'R',
      'Transport / Carrier Coordinator': 'C',
      'Dock / Yard Controller': 'C',
      'WMS / Inventory Analyst': 'C',
      'QA / QC Representative': 'C',
      'IT / Systems (ERP/WMS)': 'I',
    },
  },
  {
    stepId: 'S05',
    stepName: 'Freeze daily inbound plan version & broadcast to stakeholders',
    raci: {
      'Inbound Planning Lead': 'A',
      'Warehouse Supervisor': 'R',
      'Transport / Carrier Coordinator': 'R',
      'Dock / Yard Controller': 'C',
      'WMS / Inventory Analyst': 'R',
      'QA / QC Representative': 'I',
      'IT / Systems (ERP/WMS)': 'I',
    },
  },
  {
    stepId: 'S06',
    stepName: 'Monitor execution vs plan (arrival variance, dwell, exceptions)',
    raci: {
      'Inbound Planning Lead': 'C',
      'Warehouse Supervisor': 'A',
      'Transport / Carrier Coordinator': 'R',
      'Dock / Yard Controller': 'R',
      'WMS / Inventory Analyst': 'R',
      'QA / QC Representative': 'C',
      'IT / Systems (ERP/WMS)': 'I',
    },
  },
  {
    stepId: 'S07',
    stepName: 'Trigger intra-day replan / escalation when thresholds are breached',
    raci: {
      'Inbound Planning Lead': 'A',
      'Warehouse Supervisor': 'R',
      'Transport / Carrier Coordinator': 'C',
      'Dock / Yard Controller': 'C',
      'WMS / Inventory Analyst': 'R',
      'QA / QC Representative': 'I',
      'IT / Systems (ERP/WMS)': 'C',
    },
  },
  {
    stepId: 'S08',
    stepName: 'Close plan cycle; archive version & publish KPI snapshot',
    raci: {
      'Inbound Planning Lead': 'A',
      'Warehouse Supervisor': 'C',
      'Transport / Carrier Coordinator': 'I',
      'Dock / Yard Controller': 'I',
      'WMS / Inventory Analyst': 'R',
      'QA / QC Representative': 'I',
      'IT / Systems (ERP/WMS)': 'C',
    },
  },
];

/** Swimlane matrix: rows = BPMN pools/lanes, columns = chronological phases. */
export const SWIMLANE_PHASES = [
  'Plan inputs',
  'Capacity & slots',
  'Align & publish',
  'Execute & monitor',
  'Close-out',
] as const;

export const SWIMLANE_MATRIX: { lane: string; cells: string[] }[] = [
  {
    lane: 'Inbound Planning Lead',
    cells: [
      'Start event → gather ASNs/POs\nTask: consolidate signals',
      'Gateway (XOR): data OK?\nTask: draft slot grid',
      'Task: approve plan version\nMessage: publish plan',
      'Intermediate catch: variance alerts\nTask: approve deviation',
      'End: KPI pack sign-off',
    ],
  },
  {
    lane: 'Warehouse Supervisor',
    cells: [
      'Task: confirm labour & shifts',
      'Task: align staging / detention rules',
      'Task: brief floor teams',
      'Task: orchestrate inbound waves',
      'Task: confirm operational close',
    ],
  },
  {
    lane: 'Transport / Carrier Coordinator',
    cells: [
      'Task: carrier manifests / ETA updates',
      'Task: propose arrival sequencing',
      'Task: communicate booked slots',
      'Task: chase delays / no-shows',
      'Task: final carrier feedback',
    ],
  },
  {
    lane: 'Dock / Yard Controller',
    cells: [
      'Task: yard check / trailer pool',
      'Task: dock door assignment',
      'Task: freeze dock timetable',
      'Task: gate-in / dock-out tracking',
      'Task: yard congestion summary',
    ],
  },
  {
    lane: 'WMS / Inventory Analyst',
    cells: [
      'Task: extract ERP/WMS datasets',
      'Task: simulate capacity model',
      'Task: export published plan IDs',
      'Task: GRN vs plan reconciliation',
      'Task: archive plan snapshot',
    ],
  },
  {
    lane: 'QA / QC Representative',
    cells: [
      'Task: highlight regulated SKU paths',
      'Task: sampling plan hooks',
      'Task: agree QA holds on plan',
      'Task: record inspections tied to receipts',
      'Task: release reporting inputs',
    ],
  },
  {
    lane: 'IT / Systems (ERP/WMS)',
    cells: [
      'Task: interface health check',
      'Task: batch windows / locks',
      'Task: enable notifications',
      'Task: monitor integrations',
      'Task: job completion logs',
    ],
  },
];

export type SubProcessBlock = {
  code: string;
  title: string;
  objective: string;
  inputs: string[];
  outputs: string[];
  kpis: string[];
  steps: { id: string; text: string }[];
  raci: RaciRow[];
};

export const SUB_PROCESSES: SubProcessBlock[] = [
  {
    code: '002-001-002-001',
    title: 'Collect inbound signals & validate master data',
    objective:
      'Ensure all inbound demand signals for the planning horizon are captured, time-stamped, and aligned to valid master data before planning calculations run.',
    inputs: [
      'Purchase orders / inbound orders',
      'ASN / EDI 856 or carrier portal feeds',
      'Manual overrides (projects, returns, transfers)',
      'Receiving calendar & vendor delivery windows',
    ],
    outputs: [
      'Validated demand pipeline for D-day',
      'Exception list (missing ASN, invalid SKU, calendar breach)',
      'Audit trail of adjustments',
    ],
    kpis: [
      '% ASNs received before cut-off',
      'Master data defect rate',
      'Time to clear exceptions',
    ],
    steps: [
      { id: 'SP1.1', text: 'Pull ERP/WMS demand & ASN queues for the target date.' },
      { id: 'SP1.2', text: 'Apply business cut-offs (time zones, working hours, blackout dates).' },
      { id: 'SP1.3', text: 'Match lines to item, vendor, facility, temperature regime, customs flags.' },
      { id: 'SP1.4', text: 'Mark duplicates, cancellations, and priority overrides.' },
      { id: 'SP1.5', text: 'Route defects to owners; hold planning line until resolved or escalated.' },
    ],
    raci: [
      {
        stepId: 'SP1.1',
        stepName: 'Extract demand & ASNs',
        raci: {
          'Inbound Planning Lead': 'A',
          'Warehouse Supervisor': 'I',
          'Transport / Carrier Coordinator': 'C',
          'Dock / Yard Controller': 'I',
          'WMS / Inventory Analyst': 'R',
          'QA / QC Representative': 'I',
          'IT / Systems (ERP/WMS)': 'C',
        },
      },
      {
        stepId: 'SP1.2',
        stepName: 'Apply cut-offs',
        raci: {
          'Inbound Planning Lead': 'A',
          'Warehouse Supervisor': 'C',
          'Transport / Carrier Coordinator': 'C',
          'Dock / Yard Controller': 'I',
          'WMS / Inventory Analyst': 'R',
          'QA / QC Representative': 'I',
          'IT / Systems (ERP/WMS)': 'I',
        },
      },
      {
        stepId: 'SP1.3',
        stepName: 'Validate master data',
        raci: {
          'Inbound Planning Lead': 'C',
          'Warehouse Supervisor': 'C',
          'Transport / Carrier Coordinator': 'I',
          'Dock / Yard Controller': 'I',
          'WMS / Inventory Analyst': 'R',
          'QA / QC Representative': 'C',
          'IT / Systems (ERP/WMS)': 'C',
        },
      },
      {
        stepId: 'SP1.4',
        stepName: 'Mark duplicates & priorities',
        raci: {
          'Inbound Planning Lead': 'A',
          'Warehouse Supervisor': 'C',
          'Transport / Carrier Coordinator': 'C',
          'Dock / Yard Controller': 'I',
          'WMS / Inventory Analyst': 'R',
          'QA / QC Representative': 'I',
          'IT / Systems (ERP/WMS)': 'I',
        },
      },
      {
        stepId: 'SP1.5',
        stepName: 'Defect routing / escalation',
        raci: {
          'Inbound Planning Lead': 'A',
          'Warehouse Supervisor': 'R',
          'Transport / Carrier Coordinator': 'C',
          'Dock / Yard Controller': 'I',
          'WMS / Inventory Analyst': 'C',
          'QA / QC Representative': 'C',
          'IT / Systems (ERP/WMS)': 'I',
        },
      },
    ],
  },
  {
    code: '002-001-002-002',
    title: 'Dock, labour & equipment capacity planning',
    objective:
      'Translate validated demand into feasible dock slots, labour waves, and MHE usage constrained by safety and service rules.',
    inputs: [
      'Validated demand pipeline',
      'Dock master (doors, dimensions, constraints)',
      'Labour roster & skill matrix',
      'Equipment availability & maintenance windows',
    ],
    outputs: [
      'Slot timetable by door',
      'Labour wave plan',
      'Identified overload scenarios & mitigation options',
    ],
    kpis: [
      'Dock utilization vs target',
      'Labour overtime hours driven by inbound',
      'Plan feasibility score (no overload)',
    ],
    steps: [
      { id: 'SP2.1', text: 'Load baseline capacity model (dock minutes, unload rate distributions).' },
      { id: 'SP2.2', text: 'Sequence trailers/trucks into slots respecting constraints (food grade, DG).' },
      { id: 'SP2.3', text: 'Balance staging lanes & detention buffers vs predicted unload duration.' },
      { id: 'SP2.4', text: 'Run “what-if” for peak spikes; propose deferrals or overflow routes.' },
      { id: 'SP2.5', text: 'Document assumptions & sensitivity drivers for audit.' },
    ],
    raci: [
      {
        stepId: 'SP2.1',
        stepName: 'Load capacity model',
        raci: {
          'Inbound Planning Lead': 'A',
          'Warehouse Supervisor': 'C',
          'Transport / Carrier Coordinator': 'I',
          'Dock / Yard Controller': 'R',
          'WMS / Inventory Analyst': 'R',
          'QA / QC Representative': 'I',
          'IT / Systems (ERP/WMS)': 'I',
        },
      },
      {
        stepId: 'SP2.2',
        stepName: 'Slot sequencing',
        raci: {
          'Inbound Planning Lead': 'A',
          'Warehouse Supervisor': 'C',
          'Transport / Carrier Coordinator': 'C',
          'Dock / Yard Controller': 'R',
          'WMS / Inventory Analyst': 'R',
          'QA / QC Representative': 'C',
          'IT / Systems (ERP/WMS)': 'I',
        },
      },
      {
        stepId: 'SP2.3',
        stepName: 'Staging balance',
        raci: {
          'Inbound Planning Lead': 'C',
          'Warehouse Supervisor': 'A',
          'Transport / Carrier Coordinator': 'I',
          'Dock / Yard Controller': 'R',
          'WMS / Inventory Analyst': 'C',
          'QA / QC Representative': 'C',
          'IT / Systems (ERP/WMS)': 'I',
        },
      },
      {
        stepId: 'SP2.4',
        stepName: 'What-if & mitigation',
        raci: {
          'Inbound Planning Lead': 'A',
          'Warehouse Supervisor': 'R',
          'Transport / Carrier Coordinator': 'C',
          'Dock / Yard Controller': 'C',
          'WMS / Inventory Analyst': 'R',
          'QA / QC Representative': 'I',
          'IT / Systems (ERP/WMS)': 'I',
        },
      },
      {
        stepId: 'SP2.5',
        stepName: 'Assumption log',
        raci: {
          'Inbound Planning Lead': 'A',
          'Warehouse Supervisor': 'C',
          'Transport / Carrier Coordinator': 'I',
          'Dock / Yard Controller': 'C',
          'WMS / Inventory Analyst': 'R',
          'QA / QC Representative': 'I',
          'IT / Systems (ERP/WMS)': 'C',
        },
      },
    ],
  },
  {
    code: '002-001-002-003',
    title: 'Align stakeholders & publish the daily plan',
    objective:
      'Secure agreement across warehouse, transport, and QA on the final plan version and push authoritative timings to systems and partners.',
    inputs: [
      'Feasible slot & labour plan',
      'Exception decisions',
      'Communication templates & distribution lists',
    ],
    outputs: [
      'Published plan ID / version timestamp',
      'Carrier confirmations',
      'Floor brief packs',
    ],
    kpis: [
      'Publish timeliness vs SLA',
      'Post-publish change rate',
      'Carrier acknowledgement %',
    ],
    steps: [
      { id: 'SP3.1', text: 'Conduct rapid alignment huddle (virtual or physical) for conflicts.' },
      { id: 'SP3.2', text: 'Lock plan version; freeze master data dependent fields where required.' },
      { id: 'SP3.3', text: 'Push plan to WMS waves, yard scheduling boards, carrier portals.' },
      { id: 'SP3.4', text: 'Trigger notifications (SMS/email/API) with slot IDs & constraints.' },
      { id: 'SP3.5', text: 'Archive approval evidence & version diff vs prior day.' },
    ],
    raci: [
      {
        stepId: 'SP3.1',
        stepName: 'Alignment huddle',
        raci: {
          'Inbound Planning Lead': 'A',
          'Warehouse Supervisor': 'R',
          'Transport / Carrier Coordinator': 'R',
          'Dock / Yard Controller': 'C',
          'WMS / Inventory Analyst': 'C',
          'QA / QC Representative': 'C',
          'IT / Systems (ERP/WMS)': 'I',
        },
      },
      {
        stepId: 'SP3.2',
        stepName: 'Lock version',
        raci: {
          'Inbound Planning Lead': 'A',
          'Warehouse Supervisor': 'C',
          'Transport / Carrier Coordinator': 'I',
          'Dock / Yard Controller': 'I',
          'WMS / Inventory Analyst': 'R',
          'QA / QC Representative': 'I',
          'IT / Systems (ERP/WMS)': 'C',
        },
      },
      {
        stepId: 'SP3.3',
        stepName: 'System distribution',
        raci: {
          'Inbound Planning Lead': 'C',
          'Warehouse Supervisor': 'R',
          'Transport / Carrier Coordinator': 'C',
          'Dock / Yard Controller': 'I',
          'WMS / Inventory Analyst': 'R',
          'QA / QC Representative': 'I',
          'IT / Systems (ERP/WMS)': 'R',
        },
      },
      {
        stepId: 'SP3.4',
        stepName: 'Partner notifications',
        raci: {
          'Inbound Planning Lead': 'C',
          'Warehouse Supervisor': 'I',
          'Transport / Carrier Coordinator': 'A',
          'Dock / Yard Controller': 'I',
          'WMS / Inventory Analyst': 'R',
          'QA / QC Representative': 'I',
          'IT / Systems (ERP/WMS)': 'C',
        },
      },
      {
        stepId: 'SP3.5',
        stepName: 'Archive & evidence',
        raci: {
          'Inbound Planning Lead': 'A',
          'Warehouse Supervisor': 'C',
          'Transport / Carrier Coordinator': 'I',
          'Dock / Yard Controller': 'I',
          'WMS / Inventory Analyst': 'R',
          'QA / QC Representative': 'I',
          'IT / Systems (ERP/WMS)': 'C',
        },
      },
    ],
  },
  {
    code: '002-001-002-004',
    title: 'Execution monitoring & intra-day exception loop',
    objective:
      'Track real arrivals vs plan, trigger controlled changes when operational reality diverges from approved assumptions.',
    inputs: [
      'Live gate/dock telemetry',
      'GRN milestones',
      'Carrier ETA updates',
    ],
    outputs: [
      'Variance dashboard',
      'Approved intra-day adjustments',
      'Escalation tickets',
    ],
    kpis: [
      'Mean arrival delta',
      'Dock dwell outliers',
      'Replan cycle time',
    ],
    steps: [
      { id: 'SP4.1', text: 'Compare planned vs actual dock starts every interval (e.g. 30–60 min).' },
      { id: 'SP4.2', text: 'Classify severity using thresholds (minor / major / safety).' },
      { id: 'SP4.3', text: 'For major variance: reconvene stakeholders for constrained re-plan.' },
      { id: 'SP4.4', text: 'Document decisions; update WMS tasks & notify carriers.' },
      { id: 'SP4.5', text: 'Feed learnings into next-day planning parameters.' },
    ],
    raci: [
      {
        stepId: 'SP4.1',
        stepName: 'Interval monitoring',
        raci: {
          'Inbound Planning Lead': 'C',
          'Warehouse Supervisor': 'A',
          'Transport / Carrier Coordinator': 'R',
          'Dock / Yard Controller': 'R',
          'WMS / Inventory Analyst': 'R',
          'QA / QC Representative': 'I',
          'IT / Systems (ERP/WMS)': 'I',
        },
      },
      {
        stepId: 'SP4.2',
        stepName: 'Severity classify',
        raci: {
          'Inbound Planning Lead': 'C',
          'Warehouse Supervisor': 'A',
          'Transport / Carrier Coordinator': 'C',
          'Dock / Yard Controller': 'R',
          'WMS / Inventory Analyst': 'R',
          'QA / QC Representative': 'C',
          'IT / Systems (ERP/WMS)': 'I',
        },
      },
      {
        stepId: 'SP4.3',
        stepName: 'Re-plan session',
        raci: {
          'Inbound Planning Lead': 'A',
          'Warehouse Supervisor': 'R',
          'Transport / Carrier Coordinator': 'R',
          'Dock / Yard Controller': 'C',
          'WMS / Inventory Analyst': 'C',
          'QA / QC Representative': 'C',
          'IT / Systems (ERP/WMS)': 'I',
        },
      },
      {
        stepId: 'SP4.4',
        stepName: 'Execute changes',
        raci: {
          'Inbound Planning Lead': 'C',
          'Warehouse Supervisor': 'A',
          'Transport / Carrier Coordinator': 'R',
          'Dock / Yard Controller': 'R',
          'WMS / Inventory Analyst': 'R',
          'QA / QC Representative': 'I',
          'IT / Systems (ERP/WMS)': 'C',
        },
      },
      {
        stepId: 'SP4.5',
        stepName: 'Continuous improvement hook',
        raci: {
          'Inbound Planning Lead': 'A',
          'Warehouse Supervisor': 'R',
          'Transport / Carrier Coordinator': 'C',
          'Dock / Yard Controller': 'C',
          'WMS / Inventory Analyst': 'R',
          'QA / QC Representative': 'I',
          'IT / Systems (ERP/WMS)': 'I',
        },
      },
    ],
  },
  {
    code: '002-001-002-005',
    title: 'Close-out, archive & KPI publication',
    objective:
      'Finalize the planning cycle for the day, archive artefacts for audit, and publish performance KPIs for governance forums.',
    inputs: [
      'Final GRN status vs plan',
      'Variance logs',
      'Signed approvals',
    ],
    outputs: [
      'Closed plan record',
      'KPI pack (service, cost, quality)',
      'Inputs to S&OP / weekly rhythm',
    ],
    kpis: [
      'Plan attainment %',
      'Cost of expedite',
      'Documentation completeness',
    ],
    steps: [
      { id: 'SP5.1', text: 'Reconcile all plan lines to receipts or documented cancellations.' },
      { id: 'SP5.2', text: 'Lock archives; prevent silent edits without controlled amendment.' },
      { id: 'SP5.3', text: 'Publish KPI pack to dashboards & distribute to stakeholders.' },
      { id: 'SP5.4', text: 'Record lessons learned & parameter tweaks for tomorrow.' },
      { id: 'SP5.5', text: 'Hand-off open risks to weekly forum owner.' },
    ],
    raci: [
      {
        stepId: 'SP5.1',
        stepName: 'Final reconciliation',
        raci: {
          'Inbound Planning Lead': 'A',
          'Warehouse Supervisor': 'C',
          'Transport / Carrier Coordinator': 'I',
          'Dock / Yard Controller': 'I',
          'WMS / Inventory Analyst': 'R',
          'QA / QC Representative': 'C',
          'IT / Systems (ERP/WMS)': 'I',
        },
      },
      {
        stepId: 'SP5.2',
        stepName: 'Archive lock',
        raci: {
          'Inbound Planning Lead': 'A',
          'Warehouse Supervisor': 'C',
          'Transport / Carrier Coordinator': 'I',
          'Dock / Yard Controller': 'I',
          'WMS / Inventory Analyst': 'R',
          'QA / QC Representative': 'I',
          'IT / Systems (ERP/WMS)': 'C',
        },
      },
      {
        stepId: 'SP5.3',
        stepName: 'KPI publication',
        raci: {
          'Inbound Planning Lead': 'A',
          'Warehouse Supervisor': 'C',
          'Transport / Carrier Coordinator': 'I',
          'Dock / Yard Controller': 'I',
          'WMS / Inventory Analyst': 'R',
          'QA / QC Representative': 'C',
          'IT / Systems (ERP/WMS)': 'C',
        },
      },
      {
        stepId: 'SP5.4',
        stepName: 'Lessons learned',
        raci: {
          'Inbound Planning Lead': 'A',
          'Warehouse Supervisor': 'R',
          'Transport / Carrier Coordinator': 'C',
          'Dock / Yard Controller': 'C',
          'WMS / Inventory Analyst': 'C',
          'QA / QC Representative': 'C',
          'IT / Systems (ERP/WMS)': 'I',
        },
      },
      {
        stepId: 'SP5.5',
        stepName: 'Risk hand-off',
        raci: {
          'Inbound Planning Lead': 'A',
          'Warehouse Supervisor': 'R',
          'Transport / Carrier Coordinator': 'C',
          'Dock / Yard Controller': 'I',
          'WMS / Inventory Analyst': 'C',
          'QA / QC Representative': 'I',
          'IT / Systems (ERP/WMS)': 'I',
        },
      },
    ],
  },
];

export const PROCESS_PURPOSE =
  'Define how inbound volume for the operating day is translated into an executable dock, labour, and systems plan that balances service, cost, and compliance.';

export const PROCESS_SCOPE =
  'Covers planning cycles for facility inbound operations from signal intake through publication, execution tracking, and closed-loop reporting. Out of scope: long-range supply planning, procurement negotiation, and outbound shipment optimization.';

export const PROCESS_TRIGGERS = [
  'Daily calendar trigger before operational cut-off',
  'Material demand spikes notified by commercial or operations teams',
  'Severe weather / logistics disruption warnings',
];

export const BPMN_NOTES = [
  'Notation follows BPMN 2.0 semantics described textually (tasks, XOR gateways, message flows, intermediate events). Swimlanes represent pools/lanes for functional accountability.',
  'Exclusive gateways (XOR) mark decision points where only one path may activate (e.g., master data valid vs defect loop).',
  'Message flows between lanes imply structured communications (plan broadcast, ASN updates, escalation alerts).',
];
