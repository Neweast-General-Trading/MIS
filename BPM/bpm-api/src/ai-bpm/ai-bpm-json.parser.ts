import { BadRequestException } from '@nestjs/common';

import type { BpmDocumentJson } from './ai-bpm-document.types';

function repairJsonString(text: string): string {
  return text
    .replace(/,\s*}/g, '}')
    .replace(/,\s*]/g, ']')
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\u2018|\u2019/g, "'");
}

function extractJsonCandidates(raw: string): string[] {
  const candidates: string[] = [];
  const trimmed = raw.trim();

  const fenceRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  while ((match = fenceRegex.exec(trimmed)) !== null) {
    if (match[1]?.trim()) {
      candidates.push(match[1].trim());
    }
  }

  if (trimmed.startsWith('{')) {
    candidates.push(trimmed);
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    candidates.push(trimmed.slice(start, end + 1));
  }

  if (!trimmed.startsWith('{') && start >= 0) {
    candidates.push(`{${trimmed}`);
  }

  return [...new Set(candidates)];
}

function tryParseJson(text: string): unknown | null {
  const attempts = [text, repairJsonString(text)];
  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate);
    } catch {
      /* next */
    }
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function normalizeBlock(raw: unknown): BpmDocumentJson['sections'][0]['content'][0] | null {
  if (!isRecord(raw) || typeof raw.type !== 'string') {
    return null;
  }
  switch (raw.type) {
    case 'paragraph':
      return { type: 'paragraph', text: asString(raw.text) };
    case 'bullets': {
      const items = Array.isArray(raw.items)
        ? raw.items.map((i) => asString(i)).filter(Boolean)
        : [];
      return { type: 'bullets', items };
    }
    case 'table': {
      const headers = Array.isArray(raw.headers)
        ? raw.headers.map((h) => asString(h))
        : [];
      const rows = Array.isArray(raw.rows)
        ? raw.rows.map((row) =>
            Array.isArray(row) ? row.map((c) => asString(c)) : [],
          )
        : [];
      return { type: 'table', headers, rows };
    }
    case 'raciTable': {
      const rows = Array.isArray(raw.rows)
        ? raw.rows
            .filter(isRecord)
            .map((row) => ({
              stepId: asString(row.stepId),
              stepName: asString(row.stepName),
              r: asString(row.r, '—'),
              a: asString(row.a, '—'),
              c: asString(row.c, '—'),
              i: asString(row.i, '—'),
              notes: asString(row.notes),
            }))
        : [];
      return { type: 'raciTable', rows };
    }
    case 'swimlaneTable': {
      const phases = Array.isArray(raw.phases)
        ? raw.phases.map((p) => asString(p))
        : [];
      const lanes = Array.isArray(raw.lanes)
        ? raw.lanes
            .filter(isRecord)
            .map((lane) => ({
              lane: asString(lane.lane),
              cells: Array.isArray(lane.cells)
                ? lane.cells.map((c) => asString(c))
                : [],
            }))
        : [];
      return { type: 'swimlaneTable', phases, lanes };
    }
    default:
      return null;
  }
}

function normalizeDocument(parsed: unknown): BpmDocumentJson | null {
  if (!isRecord(parsed) || !isRecord(parsed.cover) || !Array.isArray(parsed.sections)) {
    return null;
  }

  const cover = parsed.cover;
  const sections = parsed.sections
    .filter(isRecord)
    .map((section) => {
      const content = Array.isArray(section.content)
        ? section.content
            .map(normalizeBlock)
            .filter((b): b is NonNullable<typeof b> => b !== null)
        : [];
      const rawLevel = section.level;
      const level: 1 | 2 | 3 | undefined =
        rawLevel === 1 || rawLevel === 2 || rawLevel === 3 ? rawLevel : undefined;
      return {
        heading: asString(section.heading, 'Section'),
        level,
        content,
      };
    })
    .filter((s) => s.content.length > 0 || s.heading);

  if (sections.length === 0) {
    return null;
  }

  return {
    cover: {
      title: asString(cover.title, 'Business Process Document'),
      subtitle: asString(cover.subtitle),
      processFunction: asString(cover.processFunction),
      processFunctionCode: asString(cover.processFunctionCode),
      processTarget: asString(cover.processTarget),
      companyCode: asString(cover.companyCode),
      documentVersion: asString(cover.documentVersion, '1.0'),
      confidentiality: asString(cover.confidentiality, 'Internal'),
    },
    sections,
  };
}

/** Convert Claude markdown-style output into a minimal valid document when JSON is missing. */
export function markdownToBpmDocumentJson(
  raw: string,
  defaults: {
    title: string;
    processFunction: string;
    processFunctionCode: string;
    processTarget: string;
    companyCode?: string;
  },
): BpmDocumentJson | null {
  const lines = raw.split('\n');
  const sections: BpmDocumentJson['sections'] = [];
  let current: BpmDocumentJson['sections'][0] | null = null;

  const flush = () => {
    if (current && (current.content.length > 0 || current.heading)) {
      sections.push(current);
    }
    current = null;
  };

  for (const line of lines) {
    const h1 = line.match(/^#\s+(.+)/);
    const h2 = line.match(/^##\s+(.+)/);
    const h3 = line.match(/^###\s+(.+)/);
    if (h1 || h2 || h3) {
      flush();
      const heading = (h1 ?? h2 ?? h3)![1].trim();
      const level = h1 ? 1 : h3 ? 3 : 2;
      current = { heading, level, content: [] };
      continue;
    }
    if (!current) {
      current = { heading: '1. Document body', level: 1, content: [] };
    }
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('|') && trimmed.includes('|')) {
      continue;
    }
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const last = current.content[current.content.length - 1];
      const item = trimmed.replace(/^[-*]\s+/, '');
      if (last?.type === 'bullets') {
        last.items.push(item);
      } else {
        current.content.push({ type: 'bullets', items: [item] });
      }
    } else {
      current.content.push({ type: 'paragraph', text: trimmed });
    }
  }
  flush();

  if (sections.length === 0) {
    const body = raw.trim();
    if (body.length < 40) return null;
    sections.push({
      heading: '1. Generated content',
      level: 1,
      content: [{ type: 'paragraph', text: body.slice(0, 12000) }],
    });
  }

  return {
    cover: {
      title: defaults.title,
      processFunction: defaults.processFunction,
      processFunctionCode: defaults.processFunctionCode,
      processTarget: defaults.processTarget,
      companyCode: defaults.companyCode,
      documentVersion: '1.0',
      confidentiality: 'Internal',
    },
    sections,
  };
}

export type ParseBpmDocumentResult = {
  document: BpmDocumentJson;
  source: 'json' | 'json-repaired' | 'markdown-fallback';
};

export function parseBpmDocumentJson(raw: string): ParseBpmDocumentResult {
  const normalizedRaw = raw.trim().startsWith('{') ? raw.trim() : raw.trim();
  const candidates = extractJsonCandidates(normalizedRaw);

  for (const candidate of candidates) {
    const parsed = tryParseJson(candidate);
    const doc = parsed ? normalizeDocument(parsed) : null;
    if (doc) {
      return {
        document: doc,
        source: candidate === raw.trim() ? 'json' : 'json-repaired',
      };
    }
  }

  throw new BadRequestException(
    'Automation did not return valid document JSON. Please try again.',
  );
}

export function parseBpmDocumentJsonLenient(
  raw: string,
  markdownDefaults: Parameters<typeof markdownToBpmDocumentJson>[1],
): ParseBpmDocumentResult {
  try {
    return parseBpmDocumentJson(raw);
  } catch {
    const fromMarkdown = markdownToBpmDocumentJson(raw, markdownDefaults);
    if (fromMarkdown) {
      return { document: fromMarkdown, source: 'markdown-fallback' };
    }
    throw new BadRequestException(
      'Could not build the Word document from the generated output. Please try again with fewer deliverables or a single process.',
    );
  }
}
