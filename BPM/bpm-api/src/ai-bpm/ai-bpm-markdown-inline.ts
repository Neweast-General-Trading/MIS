import { TextRun } from 'docx';

export type InlineRunStyle = {
  size?: number;
  color?: string;
  bold?: boolean;
  italics?: boolean;
  font?: string;
};

const INLINE_TOKEN =
  /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_|`([^`]+)`)/gs;

function stripResidualMarkers(text: string): string {
  return text.replace(/\*\*/g, '').replace(/(?<!\*)\*(?!\*)/g, '');
}

function run(
  text: string,
  style: InlineRunStyle,
  overrides?: Partial<InlineRunStyle>,
): TextRun {
  const merged = { ...style, ...overrides };
  return new TextRun({
    text: stripResidualMarkers(text),
    size: merged.size ?? 22,
    color: merged.color,
    bold: merged.bold,
    italics: merged.italics,
    font: merged.font,
  });
}

/** Turn markdown inline markers into Word TextRuns (bold, italic, code). */
export function inlineTextRuns(
  text: string,
  base: InlineRunStyle = {},
): TextRun[] {
  const source = text.replace(/\r\n/g, '\n');
  const runs: TextRun[] = [];
  let last = 0;
  let match: RegExpExecArray | null;

  INLINE_TOKEN.lastIndex = 0;
  while ((match = INLINE_TOKEN.exec(source)) !== null) {
    if (match.index > last) {
      const plain = source.slice(last, match.index);
      if (plain) runs.push(run(plain, base));
    }

    if (match[2] !== undefined) {
      runs.push(run(match[2], base, { bold: true, italics: true }));
    } else if (match[3] !== undefined) {
      runs.push(run(match[3], base, { bold: true }));
    } else if (match[4] !== undefined) {
      runs.push(run(match[4], base, { italics: true }));
    } else if (match[5] !== undefined) {
      runs.push(run(match[5], base, { italics: true }));
    } else if (match[6] !== undefined) {
      runs.push(run(match[6], base, { font: 'Consolas' }));
    }

    last = match.index + match[0].length;
  }

  if (last < source.length) {
    const plain = source.slice(last);
    if (plain) runs.push(run(plain, base));
  }

  if (runs.length === 0 && source) {
    runs.push(run(source, base));
  }

  if (/\*\*|__/.test(source)) {
    const rebuilt = runs
      .map((r) => {
        const o = r as TextRun & { options?: { text?: string } };
        return o.options?.text ?? '';
      })
      .join('');
    if (rebuilt.includes('**') || rebuilt.includes('__')) {
      return [run(plainMarkdownText(source), { ...base, bold: base.bold })];
    }
  }

  return runs;
}

/** Headings and labels: remove markdown decoration, keep readable text. */
export function plainMarkdownText(text: string): string {
  return stripResidualMarkers(
    text
      .replace(/\*\*\*(.+?)\*\*\*/gs, '$1')
      .replace(/\*\*(.+?)\*\*/gs, '$1')
      .replace(/\*(.+?)\*/gs, '$1')
      .replace(/_(.+?)_/gs, '$1')
      .replace(/`([^`]+)`/g, '$1'),
  );
}
