/**
 * Guards against Claude returning TOC-like headings with empty process bodies.
 */

function stripMarkdownNoise(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#{1,6}\s+.*$/gm, ' ')
    .replace(/^\|[\s-:|]+\|$/gm, ' ')
    .replace(/\[.*?\]\(.*?\)/g, ' ')
    .replace(/[*_`>#-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Count non-heading, non-separator substance characters. */
export function measureMarkdownSubstance(markdown: string): number {
  return stripMarkdownNoise(markdown).length;
}

/**
 * True when the response has headings/TOC shape but almost no real process content.
 * Typical failure mode for oversized process-function prompts.
 */
export function isMarkdownTooThinForExport(
  markdown: string,
  opts?: { minSubstanceChars?: number; requiredCodes?: string[] },
): boolean {
  const min = opts?.minSubstanceChars ?? 800;
  const substance = measureMarkdownSubstance(markdown);
  if (substance < min) return true;

  const codes = (opts?.requiredCodes ?? []).filter(Boolean);
  if (codes.length === 0) return false;

  const missing = codes.filter((code) => !markdown.includes(code));
  // If more than half the process codes never appear, treat as thin/wrong.
  return missing.length >= Math.ceil(codes.length / 2);
}

/** Remove a leading H1 title so merged PF docs don't repeat cover titles. */
export function stripLeadingMarkdownTitle(markdown: string): string {
  const lines = markdown.replace(/^\uFEFF/, '').split('\n');
  let start = 0;
  if (lines[0]?.match(/^#\s+/)) {
    start = 1;
    while (start < lines.length && !lines[start]?.trim()) start += 1;
  }
  return lines.slice(start).join('\n').trim();
}

export function buildProcessFunctionOverviewMarkdown(opts: {
  departmentName: string;
  departmentCode: string;
  companyCode?: string | null;
  processes: Array<{ code: string; name: string; subProcessCount: number }>;
}): string {
  const totalSteps = opts.processes.reduce((n, p) => n + p.subProcessCount, 0);
  const rows = opts.processes
    .map(
      (p, index) =>
        `| ${index + 1} | ${p.code} | ${p.name} | ${p.subProcessCount} |`,
    )
    .join('\n');

  return [
    '## Process function overview',
    '',
    `| Field | Value |`,
    `| --- | --- |`,
    `| Process function | ${opts.departmentName} (${opts.departmentCode}) |`,
    `| Company | ${opts.companyCode || '—'} |`,
    `| Processes | ${opts.processes.length} |`,
    `| Total sub-processes | ${totalSteps} |`,
    '',
    'Each process below was generated with Claude from live BPM master data (all template columns).',
    '',
    '### Processes in this pack',
    '',
    '| # | Code | Name | Sub-processes |',
    '| --- | --- | --- | --- |',
    rows,
    '',
  ].join('\n');
}
