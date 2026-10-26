import type { BpmDocumentJson } from './ai-bpm-document.types';
import { formatTableCell, resolveDetailValue } from './ai-bpm-detail-values';
import type {
  RelatedSubProcessWordLink,
  WordPolicyDocument,
} from './ai-bpm-policy-word.util';

type SubProcessRow = {
  code: string;
  sln?: number;
  activityName: string;
  activityDescription: string | null;
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
    processOwners: string[];
    processDescription: string | null;
    description: string | null;
    companyCode?: string | null;
    activityTemplateName?: string | null;
  };
  subProcesses: SubProcessRow[];
};

type ExportLike =
  | {
      meta: { scope: 'process' };
      processFunction: {
        code: string;
        name: string;
        companyCode: string;
      };
      process: ProcessSlice['process'];
      subProcesses: SubProcessRow[];
    }
  | {
      meta: { scope: 'processFunction' };
      processFunction: {
        code: string;
        name: string;
        companyCode: string;
      };
      processes: ProcessSlice[];
    };

function sorted(rows: SubProcessRow[]): SubProcessRow[] {
  return rows
    .slice()
    .sort(
      (a, b) =>
        (a.sln ?? 0) - (b.sln ?? 0) || a.code.localeCompare(b.code),
    );
}

function cellText(value: unknown): string {
  return formatTableCell(value);
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

function raciRows(subProcesses: SubProcessRow[]) {
  return sorted(subProcesses).map((sp) => {
    const owners = sp.owners ?? [];
    const r =
      detailByAliases(sp.details, [
        'responsible',
        'r',
        'racir',
        'raciresponsible',
      ]) ||
      owners[0] ||
      '—';
    const a =
      detailByAliases(sp.details, [
        'accountable',
        'a',
        'racia',
        'raciaccountable',
      ]) ||
      owners[0] ||
      '—';
    const c =
      detailByAliases(sp.details, [
        'consulted',
        'c',
        'racic',
        'raciconsulted',
      ]) || '—';
    const i =
      detailByAliases(sp.details, [
        'informed',
        'i',
        'racii',
        'raciinformed',
      ]) || '—';
    return {
      stepId: sp.code,
      stepName: sp.activityName,
      r,
      a,
      c,
      i,
      notes: sp.status || '—',
    };
  });
}

function catalogueTable(subProcesses: SubProcessRow[]) {
  return {
    type: 'table' as const,
    headers: ['SLN', 'Code', 'Name', 'Status', 'Owners', 'Parent code'],
    rows: sorted(subProcesses).map((sp) => [
      String(sp.sln ?? '—'),
      sp.code,
      sp.activityName,
      sp.status || '—',
      (sp.owners ?? []).join(', ') || '—',
      sp.parentCode?.trim() || '—',
    ]),
  };
}

function detailRegisterBlocks(subProcesses: SubProcessRow[]) {
  const blocks: BpmDocumentJson['sections'][number]['content'] = [];
  for (const sp of sorted(subProcesses)) {
    blocks.push({
      type: 'paragraph',
      text: `${sp.code} — ${sp.activityName}`,
    });
    const rows: string[][] = [
      ['SLN', String(sp.sln ?? '—')],
      ['Code', sp.code],
      ['Name', sp.activityName],
      ['Description', sp.activityDescription?.trim() || '—'],
      ['Status', sp.status || '—'],
      ['Owners', (sp.owners ?? []).join(', ') || '—'],
      ['Parent code', sp.parentCode?.trim() || '—'],
    ];
    const details = sp.details ?? {};
    const skip = new Set(
      [
        'activity_id',
        'activityid',
        'process_id',
        'processid',
        'si_no',
        'sino',
        'sln',
        'code',
        'activitycode',
        'name',
        'activity_name',
        'activityname',
        'description',
        'activity_description',
        'activitydescription',
        'status',
        'owners',
        'owner',
        'parent',
        'parentcode',
      ].map((k) => k),
    );
    // Include every remaining detail column, including empty values as "—".
    for (const [key, value] of Object.entries(details)) {
      const nk = key.trim().toLowerCase().replace(/[\s._-]+/g, '');
      if (skip.has(nk)) continue;
      rows.push([key, cellText(value)]);
    }
    // 1) Sub-process content
    blocks.push({
      type: 'table',
      headers: ['Field', 'Value'],
      rows,
    });

    // 2) Integrated sub-process name (+ BPM URL when available)
    const relatedTitles = (sp.relatedSubProcesses ?? [])
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        const code = item.code?.trim() ?? '';
        const name = item.activityName?.trim() ?? '';
        const label = code && name ? `${code} — ${name}` : name || code;
        return item.bpmUrl ? `${label} (${item.bpmUrl})` : label;
      })
      .filter(Boolean);
    if (relatedTitles.length) {
      blocks.push({
        type: 'paragraph',
        text: 'Integrated sub-process',
      });
      blocks.push({
        type: 'bullets',
        items: relatedTitles,
      });
    }

    // 3) Full related policy content
    for (const policy of sp.relatedPolicyDocuments ?? []) {
      blocks.push({
        type: 'paragraph',
        text: `Related Policy — ${policy.name}`,
      });
      blocks.push({
        type: 'table',
        headers: ['Field', 'Value'],
        rows: [
          ['Company', policy.companyName || '—'],
          ['Department', policy.departmentName || '—'],
          [
            'Document Version',
            policy.version != null ? String(policy.version) : '—',
          ],
          ['Business role', policy.businessRole || '—'],
        ],
      });
      for (const [index, section] of (policy.sections ?? []).entries()) {
        const num = String(index + 1).padStart(2, '0');
        blocks.push({
          type: 'paragraph',
          text: `${num} ${section.title}`,
        });
        blocks.push({
          type: 'paragraph',
          text: section.contentPlain?.trim() || '—',
        });
      }
      blocks.push({
        type: 'paragraph',
        text: 'Confidential Policy Document · © NEWEAST',
      });
    }
  }
  return blocks;
}

function ownerSwimlane(subProcesses: SubProcessRow[]) {
  const ordered = sorted(subProcesses);
  if (!ordered.length) {
    return {
      type: 'swimlaneTable' as const,
      phases: ['Initiate', 'Execute', 'Complete'],
      lanes: [{ lane: 'Process owner', cells: ['—', '—', '—'] }],
    };
  }

  const n = ordered.length;
  const cut1 = Math.max(1, Math.ceil(n / 3));
  const cut2 = Math.max(cut1 + 1, Math.ceil((2 * n) / 3));
  const phases = [
    `Phase 1 (SLN 1–${cut1})`,
    `Phase 2 (SLN ${cut1 + 1}–${cut2})`,
    `Phase 3 (SLN ${cut2 + 1}–${n})`,
  ];
  const buckets = [
    ordered.slice(0, cut1),
    ordered.slice(cut1, cut2),
    ordered.slice(cut2),
  ];

  const laneNames = new Set<string>();
  for (const sp of ordered) {
    for (const owner of sp.owners ?? []) {
      if (owner.trim()) laneNames.add(owner.trim());
    }
  }
  if (!laneNames.size) laneNames.add('Process owner');

  const lanes = [...laneNames].sort((a, b) => a.localeCompare(b)).map((lane) => ({
    lane,
    cells: buckets.map((bucket) => {
      const codes = bucket
        .filter((sp) =>
          (sp.owners ?? []).some((o) => o.trim() === lane) ||
          (!(sp.owners ?? []).length && lane === 'Process owner'),
        )
        .map((sp) => sp.code);
      return codes.length ? codes.join(', ') : '—';
    }),
  }));

  return {
    type: 'swimlaneTable' as const,
    phases,
    lanes,
  };
}

function sequenceBullets(subProcesses: SubProcessRow[]) {
  return {
    type: 'bullets' as const,
    items: sorted(subProcesses).map(
      (sp, index) =>
        `${index + 1}. [${sp.code}] ${sp.activityName} — ${sp.status || 'Draft'}`,
    ),
  };
}

function processBody(slice: ProcessSlice): BpmDocumentJson['sections'] {
  const { process, subProcesses } = slice;
  const ordered = sorted(subProcesses);
  return [
    {
      heading: `Process overview — ${process.code}`,
      level: 2,
      content: [
        {
          type: 'paragraph',
          text:
            process.processDescription?.trim() ||
            process.description?.trim() ||
            `${process.processName || process.name} — assembled from BPM master data.`,
        },
        {
          type: 'table',
          headers: ['Attribute', 'Value'],
          rows: [
            ['Process code', process.code],
            ['Process name', process.processName || process.name || '—'],
            ['Company', process.companyCode || '—'],
            ['Template', process.activityTemplateName || '—'],
            ['Owners', (process.processOwners ?? []).join(', ') || '—'],
            ['Sub-process count', String(ordered.length)],
          ],
        },
      ],
    },
    {
      heading: `Sub-process catalogue — ${process.code}`,
      level: 2,
      content: [
        {
          type: 'paragraph',
          text: 'Ordered by SLN. Codes and names are taken from BPM data (no invented steps).',
        },
        catalogueTable(ordered),
      ],
    },
    {
      heading: `Detailed sub-process register — ${process.code}`,
      level: 2,
      content: [
        {
          type: 'paragraph',
          text: 'One block per sub-process with all template field values present in BPM.',
        },
        ...detailRegisterBlocks(ordered),
      ],
    },
    {
      heading: `RACI matrix — ${process.code}`,
      level: 2,
      content: [
        {
          type: 'paragraph',
          text: 'R/A/C/I taken from template fields when present; otherwise owners are used for R and A.',
        },
        { type: 'raciTable', rows: raciRows(ordered) },
      ],
    },
    {
      heading: `Process flow and swimlanes — ${process.code}`,
      level: 2,
      content: [
        {
          type: 'paragraph',
          text: 'End-to-end sequence (authoritative order by SLN):',
        },
        sequenceBullets(ordered),
        {
          type: 'paragraph',
          text: 'Swimlane matrix by owner across three chronological phases:',
        },
        ownerSwimlane(ordered),
      ],
    },
  ];
}

/**
 * Deterministic Word document from BPM export JSON.
 * Prefer this for Download Word — fast, consistent codes/tables, no LLM drift.
 */
export function buildDeterministicWordDocument(
  exportJson: ExportLike,
  cover: BpmDocumentJson['cover'],
  generatedAt: string,
): BpmDocumentJson {
  const sections: BpmDocumentJson['sections'] = [
    {
      heading: '1. Document control',
      level: 1,
      content: [
        {
          type: 'table',
          headers: ['Field', 'Value'],
          rows: [
            ['Document title', cover.title],
            ['Process function', `${cover.processFunction} (${cover.processFunctionCode})`],
            ['Target', cover.processTarget],
            ['Company', cover.companyCode || '—'],
            ['Document Version', cover.documentVersion || '1.0'],
            ['Confidentiality', cover.confidentiality || 'Internal'],
            ['Generated at (UTC)', generatedAt],
            ['Source', 'BPM master data (deterministic export)'],
          ],
        },
      ],
    },
  ];

  if (exportJson.meta.scope === 'process') {
    const single = exportJson as Extract<ExportLike, { meta: { scope: 'process' } }>;
    const count = single.subProcesses.length;
    sections.push({
      heading: '2. Executive summary',
      level: 1,
      content: [
        {
          type: 'paragraph',
          text: `Process function ${exportJson.processFunction.name} (${exportJson.processFunction.code}) — process ${single.process.code} (${single.process.processName || single.process.name}) with ${count} sub-process(es). This Word file is built directly from BPM data so codes, owners, and field values stay consistent with the system.`,
        },
      ],
    });
    sections.push({
      heading: '3. Process content',
      level: 1,
      content: [
        {
          type: 'paragraph',
          text: 'Sections below cover catalogue, detailed register, RACI, and flows for this process.',
        },
      ],
    });
    sections.push(
      ...processBody({
        process: single.process,
        subProcesses: single.subProcesses,
      }),
    );
  } else {
    const multi = exportJson as Extract<
      ExportLike,
      { meta: { scope: 'processFunction' } }
    >;
    const total = multi.processes.reduce(
      (n, p) => n + p.subProcesses.length,
      0,
    );
    sections.push({
      heading: '2. Executive summary',
      level: 1,
      content: [
        {
          type: 'paragraph',
          text: `Process function ${exportJson.processFunction.name} (${exportJson.processFunction.code}) covers ${multi.processes.length} process(es) and ${total} sub-process(es). Each process section below is generated from live BPM data.`,
        },
      ],
    });
    multi.processes.forEach((slice, index) => {
      sections.push({
        heading: `${index + 3}. Process ${slice.process.code} — ${slice.process.processName || slice.process.name}`,
        level: 1,
        content: [
          {
            type: 'paragraph',
            text: `Owners: ${(slice.process.processOwners ?? []).join(', ') || 'TBD'}`,
          },
        ],
      });
      sections.push(...processBody(slice));
    });
  }

  sections.push({
    heading: 'Appendix — metadata',
    level: 1,
    content: [
      {
        type: 'bullets',
        items: [
          `Process function code: ${cover.processFunctionCode}`,
          `Company: ${cover.companyCode || '—'}`,
          `Generated: ${generatedAt}`,
          'Comments/discussion threads are excluded from this export.',
        ],
      },
    ],
  });

  return { cover, sections };
}

/** @deprecated Prefer buildDeterministicWordDocument for Word download. */
export function buildFallbackBpmDocument(
  exportJson: ExportLike,
  _templateIds: string[],
  cover: BpmDocumentJson['cover'],
): BpmDocumentJson {
  return buildDeterministicWordDocument(
    exportJson,
    cover,
    new Date().toISOString(),
  );
}
