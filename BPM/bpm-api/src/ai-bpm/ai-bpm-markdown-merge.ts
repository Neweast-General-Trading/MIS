/**
 * Helpers to merge per-process Claude markdown into one Process Function Word body.
 */

/** Remove leading H1 and any Claude-invented Table of Contents block. */
export function sanitizeProcessMarkdownForMerge(markdown: string): string {
  let text = markdown.replace(/\r\n/g, '\n').trim();

  // Drop a leading # title (cover title is separate in Word).
  text = text.replace(/^#\s+[^\n]+\n+/, '');

  // Remove markdown TOC sections Claude sometimes invents (causes empty-looking Word packs).
  const lines = text.split('\n');
  const kept: string[] = [];
  let skippingToc = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^#{1,3}\s*(table of contents|contents|toc)\b/i.test(trimmed)) {
      skippingToc = true;
      continue;
    }
    if (skippingToc) {
      if (/^#{1,3}\s+/.test(trimmed)) {
        skippingToc = false;
        kept.push(line);
      }
      continue;
    }
    kept.push(line);
  }
  text = kept.join('\n');

  return text.trim();
}

/** True when markdown is mostly headings / too thin to ship as a process chapter. */
export function isMarkdownContentTooThin(markdown: string): boolean {
  const text = markdown.replace(/\r\n/g, '\n').trim();
  if (text.length < 400) return true;

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return true;

  const headingLines = lines.filter((l) => /^#{1,6}\s+/.test(l)).length;
  const tableLines = lines.filter((l) => l.startsWith('|')).length;
  const proseLines = lines.filter(
    (l) =>
      !/^#{1,6}\s+/.test(l) &&
      !l.startsWith('|') &&
      !l.startsWith('```') &&
      !/^[-*]\s*$/.test(l),
  ).length;

  if (headingLines >= 3 && tableLines < 4 && proseLines < 8) return true;
  if (headingLines > 0 && headingLines / lines.length > 0.55 && tableLines < 6) {
    return true;
  }
  return false;
}

export function buildProcessFunctionPackMarkdown(opts: {
  processFunctionCode: string;
  processFunctionName: string;
  processCount: number;
  subProcessCount: number;
  chapters: Array<{
    processCode: string;
    processName: string;
    markdown: string;
  }>;
}): string {
  const intro = [
    `# Process Function Pack — ${opts.processFunctionName} (${opts.processFunctionCode})`,
    '',
    `This Word pack covers ${opts.processCount} process(es) and ${opts.subProcessCount} sub-process(es).`,
    'Each chapter below is generated from live BPM data with Claude-assisted narrative.',
    'Comments and discussion threads were excluded.',
    '',
    '## Pack contents',
    '',
    ...opts.chapters.map(
      (ch, index) =>
        `${index + 1}. ${ch.processCode} — ${ch.processName}`,
    ),
    '',
  ];

  const body = opts.chapters.map((ch, index) => {
    const cleaned = sanitizeProcessMarkdownForMerge(ch.markdown);
    return [
      `# ${index + 1}. Process ${ch.processCode} — ${ch.processName}`,
      '',
      cleaned,
      '',
    ].join('\n');
  });

  return [...intro, ...body].join('\n').trim() + '\n';
}
