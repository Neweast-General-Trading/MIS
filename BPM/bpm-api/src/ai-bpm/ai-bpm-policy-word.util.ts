/**
 * Policy Creator print-style blocks for BPM Word export.
 * Converts stored HTML sections to plain text and serializes
 * fence markers that the prose DOCX builder renders as styled cards.
 */

export type WordPolicySection = {
  title: string;
  contentPlain: string;
  /** Original Policy Creator HTML, used to keep bold, italics and lists. */
  contentHtml: string;
  /** Business rules of this topic, numbered 3.1, 3.2 … in Policy Creator. */
  businessRules: string[];
};

export type WordPolicyDocumentMeta = {
  documentCode: string;
  visibility: string;
  distributionList: string;
  authorisers: Array<{
    label: string;
    name: string;
    role: string;
    signature: string;
  }>;
  versionHistory: Array<{
    version: string;
    date: string;
    approvedBy: string;
    reason: string;
  }>;
  effectiveDate: string;
};

export type WordPolicyDocument = {
  id: string;
  name: string;
  version: number | null;
  companyName: string;
  departmentName: string;
  businessRole: string;
  sections: WordPolicySection[];
  /** Present when the full Policy Creator document could be loaded. */
  documentMeta?: WordPolicyDocumentMeta;
  processLabel?: string;
};

/**
 * Policy Creator HTML → plain text for Word.
 * Keeps letters/commas/punctuation exactly; only strips tags and normalizes breaks.
 */
export function htmlToWordPlain(html: string): string {
  if (!html?.trim()) return '';
  let s = String(html).replace(/\r\n/g, '\n');

  // Tables: one line per row; cells joined with ", " (content commas stay untouched).
  s = s.replace(/<\s*table[^>]*>[\s\S]*?<\/\s*table\s*>/gi, (tableHtml) => {
    const rows: string[] = [];
    const rowRe = /<\s*tr[^>]*>([\s\S]*?)<\/\s*tr\s*>/gi;
    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRe.exec(tableHtml))) {
      const cells: string[] = [];
      const cellRe = /<\s*t[dh][^>]*>([\s\S]*?)<\/\s*t[dh]\s*>/gi;
      let cellMatch: RegExpExecArray | null;
      while ((cellMatch = cellRe.exec(rowMatch[1] ?? ''))) {
        const cell = htmlToWordPlain(cellMatch[1] ?? '')
          .replace(/\n+/g, ' ')
          .trim();
        if (cell) cells.push(cell);
      }
      if (cells.length) rows.push(cells.join(', '));
    }
    return rows.length ? `\n${rows.join('\n')}\n` : '';
  });

  return s
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/\s*p\s*>/gi, '\n\n')
    .replace(/<\/\s*div\s*>/gi, '\n')
    .replace(/<\/\s*h[1-6]\s*>/gi, '\n')
    .replace(/<\/\s*li\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function toWordPolicyDocument(input: {
  id: string;
  name: string;
  version?: number | null;
  companyName?: string | null;
  departmentName?: string | null;
  businessRole?: string | null;
  sections?: Array<{
    title?: string;
    content?: string;
    businessRules?: string[];
  }>;
  documentMeta?: WordPolicyDocumentMeta;
  processCode?: string;
  processName?: string;
}): WordPolicyDocument {
  return {
    id: input.id,
    name: String(input.name ?? '').trim() || 'Untitled Policy',
    version:
      input.version != null && Number.isFinite(Number(input.version))
        ? Number(input.version)
        : null,
    companyName: String(input.companyName ?? '').trim(),
    departmentName: String(input.departmentName ?? '').trim(),
    businessRole: String(input.businessRole ?? '').trim(),
    sections: (input.sections ?? []).map((section, index) => ({
      title: String(section.title ?? '').trim() || `Section ${index + 1}`,
      contentPlain: htmlToWordPlain(String(section.content ?? '')),
      contentHtml: String(section.content ?? ''),
      businessRules: (section.businessRules ?? [])
        .map((rule) => String(rule ?? '').trim())
        .filter(Boolean),
    })),
    documentMeta: input.documentMeta,
    processLabel:
      [input.processCode, input.processName].filter(Boolean).join(' · ') ||
      undefined,
  };
}

/** Word bookmark id for a sub-process code (TOC / in-doc anchors). */
export function subProcessBookmarkId(code: string): string {
  const safe = String(code ?? '')
    .trim()
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 36);
  return `sp_${safe || 'unknown'}`;
}

/** Clickable Word → BPM UI deep link payload. */
export type RelatedSubProcessWordLink = {
  id: string;
  code: string;
  activityName: string;
  processId: string;
  departmentId: string;
  /** Absolute URL into BPM activities table focused on this activity. */
  bpmUrl: string;
};

/** Prefer PUBLIC_APP_URL, else first https FRONTEND_ORIGIN, else first origin. */
export function publicBpmAppBase(): string {
  const dedicated = process.env.PUBLIC_APP_URL?.trim();
  if (dedicated) return dedicated.replace(/\/+$/, '');
  const origins = (process.env.FRONTEND_ORIGIN ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const https = origins.find((o) => /^https:\/\//i.test(o));
  const pick = https || origins[0] || 'https://bpm.neweast.cloud';
  return pick.replace(/\/+$/, '');
}

export function bpmActivityDeepLink(
  departmentId: string,
  processId: string,
  activityId: string,
): string {
  const base = publicBpmAppBase();
  const q = encodeURIComponent(activityId);
  return `${base}/departments/${departmentId}/processes/${processId}/activities-table?activity=${q}`;
}

/**
 * Order under each sub-process in Word:
 * 1) sub-process content (caller)
 * 2) integrated sub-process name + BPM deep link
 * 3) full related policy body
 */
export function relatedSubProcessMarkdown(
  links: Array<string | RelatedSubProcessWordLink>,
): string {
  const items = links
    .map((item) => {
      if (typeof item === 'string') {
        const title = item.trim();
        if (!title) return null;
        return { label: title, url: '' };
      }
      const code = String(item.code ?? '').trim();
      const name = String(item.activityName ?? '').trim();
      const label =
        code && name ? `${code} — ${name}` : name || code || item.id;
      const url = String(item.bpmUrl ?? '').trim();
      return label ? { label, url } : null;
    })
    .filter((x): x is { label: string; url: string } => Boolean(x));
  if (!items.length) return '';
  return [
    '#### Integrated sub-process',
    '',
    ...items.map(({ label, url }) =>
      url ? `- [${label}](${url})` : `- ${label}`,
    ),
    '',
  ].join('\n');
}

/** Full Policy Creator document — always after integrated sub-process links. */
export function relatedPolicyMarkdown(policies: WordPolicyDocument[]): string {
  if (!policies.length) return '';
  const blocks: string[] = ['#### Related Policy', ''];
  for (const policy of policies) {
    blocks.push(':::bpm-policy');
    blocks.push(JSON.stringify(policy));
    blocks.push(':::');
    blocks.push('');
  }
  return blocks.join('\n');
}

/* ------------------------------------------------------------------ */
/* Rich text (bold / italic / lists) from Policy Creator HTML          */
/* ------------------------------------------------------------------ */

export type RichRun = {
  text: string;
  bold?: boolean;
  italics?: boolean;
  underline?: boolean;
};
export type RichBlock = {
  kind: 'p' | 'bullet' | 'number';
  runs: RichRun[];
  number?: number;
};

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    );
}

/**
 * Converts Policy Creator HTML into paragraphs of formatted runs so the Word
 * document keeps bold text, italics, underline and bullet / numbered lists.
 */
export function htmlToRichBlocks(html: string): RichBlock[] {
  const source = String(html ?? '').replace(/\r\n/g, '\n');
  if (!source.trim()) return [];
  const blocks: RichBlock[] = [];
  let runs: RichRun[] = [];
  let kind: RichBlock['kind'] = 'p';
  let number = 0;
  const lists: Array<{ ordered: boolean; count: number }> = [];
  let bold = 0;
  let italics = 0;
  let underline = 0;

  const flush = () => {
    const text = runs.map((item) => item.text).join('');
    if (text.trim()) {
      const first = runs.find((item) => item.text.trim());
      if (first) first.text = first.text.replace(/^\s+/, '');
      const last = [...runs].reverse().find((item) => item.text.trim());
      if (last) last.text = last.text.replace(/\s+$/, '');
      blocks.push({
        kind,
        runs: runs.filter((item) => item.text),
        number: kind === 'number' ? number : undefined,
      });
    }
    runs = [];
    kind = 'p';
  };

  const tokens = source.match(/<\/?[a-zA-Z][^>]*>|[^<]+|</g) ?? [];
  for (const token of tokens) {
    if (!token.startsWith('<') || token === '<') {
      const text = decodeEntities(token.replace(/\s*\n\s*/g, ' '));
      if (text)
        runs.push({
          text,
          bold: bold > 0,
          italics: italics > 0,
          underline: underline > 0,
        });
      continue;
    }
    const closing = token.startsWith('</');
    const tag = (
      token.match(/^<\/?\s*([a-zA-Z0-9]+)/)?.[1] ?? ''
    ).toLowerCase();
    if (['strong', 'b'].includes(tag) || /^h[1-6]$/.test(tag)) {
      bold = Math.max(0, bold + (closing ? -1 : 1));
      if (/^h[1-6]$/.test(tag)) flush();
    } else if (['em', 'i'].includes(tag)) {
      italics = Math.max(0, italics + (closing ? -1 : 1));
    } else if (tag === 'u') {
      underline = Math.max(0, underline + (closing ? -1 : 1));
    } else if (tag === 'ul' || tag === 'ol') {
      flush();
      if (closing) lists.pop();
      else lists.push({ ordered: tag === 'ol', count: 0 });
    } else if (tag === 'li') {
      flush();
      if (!closing) {
        const list = lists[lists.length - 1];
        if (list?.ordered) {
          list.count += 1;
          number = list.count;
          kind = 'number';
        } else {
          kind = 'bullet';
        }
      }
    } else if (tag === 'br') {
      flush();
    } else if (['p', 'div', 'tr', 'table', 'blockquote'].includes(tag)) {
      flush();
    } else if ((tag === 'td' || tag === 'th') && closing) {
      runs.push({ text: '  ·  ', bold: false });
    }
  }
  flush();
  return blocks.map((block) => {
    const cleaned = block.runs.map((item) => ({ ...item }));
    if (cleaned.length) {
      const last = cleaned[cleaned.length - 1];
      last.text = last.text.replace(/\s*·\s*$/, '');
      const first = cleaned[0];
      if (block.kind === 'p')
        first.text = first.text.replace(/^[\u2022\u00b7*]\s+/, '');
    }
    return { ...block, runs: cleaned };
  });
}
