type SubProcessRow = {
  code: string;
  sln: number;
  activityName: string;
  status: string;
  owners: string[];
  parentCode: string | null;
};

type ProcessSlice = {
  process: { code: string; processName: string; name: string };
  subProcesses: SubProcessRow[];
};

function sortedSubProcesses(rows: SubProcessRow[]): SubProcessRow[] {
  return rows.slice().sort((a, b) => a.sln - b.sln || a.code.localeCompare(b.code));
}

function uniqueLanes(rows: SubProcessRow[]): string[] {
  const lanes = new Set<string>();
  for (const row of rows) {
    for (const owner of row.owners ?? []) {
      const lane = owner.trim();
      if (lane) lanes.add(lane);
    }
  }
  if (lanes.size === 0) lanes.add('Process owner');
  return [...lanes].sort((a, b) => a.localeCompare(b));
}

function formatSequenceBlock(title: string, rows: SubProcessRow[]): string {
  const ordered = sortedSubProcesses(rows);
  if (!ordered.length) return `${title}\n(no sub-processes)`;

  const lanes = uniqueLanes(ordered);
  const lines: string[] = [title, '', 'Ordered sequence (do NOT reorder):'];
  ordered.forEach((row, index) => {
    const owners = (row.owners ?? []).join(', ') || '—';
    const parent = row.parentCode ? ` | parent: ${row.parentCode}` : '';
    lines.push(
      `${index + 1}. [${row.code}] ${row.activityName} | status: ${row.status} | owners: ${owners}${parent}`,
    );
  });

  lines.push('', 'Suggested swimlane lanes (one row per lane in swimlane table):');
  lanes.forEach((lane) => lines.push(`- ${lane}`));

  lines.push('', 'Mermaid node labels (use these exact codes in diagrams):');
  ordered.forEach((row) => {
    const short = row.activityName.length > 36
      ? `${row.activityName.slice(0, 33)}…`
      : row.activityName;
    lines.push(`- ${row.code}: "${row.code} — ${short}"`);
  });

  return lines.join('\n');
}

export function buildFlowHintFromSingleProcessExport(input: {
  processCode: string;
  processName: string;
  subProcesses: SubProcessRow[];
}): string {
  return formatSequenceBlock(
    `Process ${input.processCode} — ${input.processName}`,
    input.subProcesses,
  );
}

export function buildFlowHintFromExportJson(exportJson: {
  meta: { scope: 'process' | 'processFunction' };
  process?: { code: string; processName: string; name: string };
  subProcesses?: SubProcessRow[];
  processes?: ProcessSlice[];
}): string {
  if (exportJson.meta.scope === 'process' && exportJson.subProcesses) {
    const proc = exportJson.process!;
    return buildFlowHintFromSingleProcessExport({
      processCode: proc.code,
      processName: proc.processName?.trim() || proc.name?.trim() || proc.code,
      subProcesses: exportJson.subProcesses,
    });
  }

  const slices = exportJson.processes ?? [];
  if (!slices.length) return 'No sub-process flow data available.';

  return slices
    .map((slice) =>
      buildFlowHintFromSingleProcessExport({
        processCode: slice.process.code,
        processName:
          slice.process.processName?.trim() ||
          slice.process.name?.trim() ||
          slice.process.code,
        subProcesses: slice.subProcesses,
      }),
    )
    .join('\n\n---\n\n');
}
