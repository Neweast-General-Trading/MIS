/** Prepare Claude markdown for Word export (tables, bold, section breaks). */

const FIELD_LINE = /^\*\*([^*]+):\*\*\s*(.*)$/;

function isProtectedFenceLine(trimmed: string): boolean {
  return trimmed.startsWith('```') || trimmed.startsWith(':::');
}

export function convertFieldBlocksToTables(markdown: string): string {
  const lines = markdown.split('\n');
  const out: string[] = [];
  let inFence = false;

  for (let i = 0; i < lines.length; ) {
    const line = lines[i];
    const trimmed = line.trim();

    if (isProtectedFenceLine(trimmed)) {
      inFence = !inFence;
      out.push(line);
      i += 1;
      continue;
    }

    if (!inFence && FIELD_LINE.test(trimmed)) {
      const rows: string[] = [];
      while (i < lines.length && FIELD_LINE.test(lines[i].trim())) {
        const m = lines[i].trim().match(FIELD_LINE);
        if (m) {
          const label = m[1].replace(/\|/g, '\\|').trim();
          const value = (m[2] || '—').replace(/\|/g, '\\|').trim();
          rows.push(`| ${label} | ${value} |`);
        }
        i += 1;
      }
      if (rows.length > 0) {
        out.push('| Field | Value |');
        out.push('| --- | --- |');
        out.push(...rows);
        out.push('');
        continue;
      }
    }

    out.push(line);
    i += 1;
  }

  return out.join('\n');
}

export function normalizeMarkdownForDocx(markdown: string): string {
  let result = markdown.replace(/\r\n/g, '\n');

  result = convertFieldBlocksToTables(result);

  const lines = result.split('\n');
  let inFence = false;
  result = lines
    .map((line) => {
      const t = line.trim();
      if (isProtectedFenceLine(t)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      if (/^---+$/.test(t)) return '<<SECTION_BREAK>>';
      return line;
    })
    .join('\n');

  return result;
}

export function isSectionBreakLine(line: string): boolean {
  return line.trim() === '<<SECTION_BREAK>>';
}
