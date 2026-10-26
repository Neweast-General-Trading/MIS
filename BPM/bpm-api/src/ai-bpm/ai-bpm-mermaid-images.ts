import { execFile } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const MERMAID_INK = 'https://mermaid.ink/img';

/** Light sanitize so mermaid.ink accepts Claude output more reliably. */
function sanitizeMermaidCode(code: string): string {
  return code
    .replace(/\r\n/g, '\n')
    .replace(/^\s*%%.*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();
}

function toMermaidInkUrl(code: string, query?: string): string {
  const base64 = Buffer.from(sanitizeMermaidCode(code), 'utf8').toString(
    'base64',
  );
  // Crisp enough for Word without long mermaid.ink waits
  return `${MERMAID_INK}/${base64}?${query ?? 'type=png&bgColor=!ffffff&width=1400&height=1800'}`;
}

/** Render one Mermaid diagram to PNG. Returns null if the renderer is unavailable. */
export async function renderMermaidPng(code: string): Promise<Buffer | null> {
  const trimmed = sanitizeMermaidCode(code);
  if (!trimmed) return null;
  try {
    const response = await fetch(toMermaidInkUrl(trimmed), {
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Replaces ```mermaid fences with embedded PNG images for Pandoc → Word.
 * Falls back to a short note if rendering fails.
 */
export async function embedMermaidDiagramsInMarkdown(
  markdown: string,
  assetsDir: string,
): Promise<{ markdown: string; diagramCount: number }> {
  const regex = /```mermaid\s*([\s\S]*?)```/gi;
  let diagramCount = 0;
  let result = markdown;

  const matches = [...markdown.matchAll(regex)];
  // Several short top-to-bottom diagrams; keep them all so flows stay readable.
  const jobs = matches.slice(0, 8).map(async (match, index) => {
    const code = match[1]?.trim() ?? '';
    const placeholder = match[0];
    if (!code) {
      return {
        placeholder,
        replacement:
          '\n\n_Process flow diagram: see the swimlane table in this section._\n\n',
        ok: false,
      };
    }
    const fileName = `bpmn-flow-${index}.png`;
    const filePath = join(assetsDir, fileName);
    try {
      const url = toMermaidInkUrl(code);
      const response = await fetch(url, {
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) {
        throw new Error(`mermaid.ink HTTP ${response.status}`);
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      await writeFile(filePath, bytes);
      return {
        placeholder,
        replacement: `\n\n![BPMN process flow diagram](${fileName})\n\n`,
        ok: true,
      };
    } catch {
      return {
        placeholder,
        replacement:
          '\n\n_Process flow diagram: see the swimlane table in this section._\n\n',
        ok: false,
      };
    }
  });

  const rendered = await Promise.all(jobs);
  for (const item of rendered) {
    result = result.replace(item.placeholder, item.replacement);
    if (item.ok) diagramCount += 1;
  }
  for (const match of matches.slice(8)) {
    result = result.replace(
      match[0],
      '\n\n_Additional flow diagram omitted for export speed — see sequence and swimlane tables._\n\n',
    );
  }

  return { markdown: result, diagramCount };
}

import { normalizeMarkdownForDocx } from './ai-bpm-markdown-normalize';

/** Remove headings that advertise raw Mermaid syntax in Word. */
export function polishMarkdownForWord(markdown: string): string {
  const polished = markdown
    .replace(/\s*\(Mermaid Syntax\)/gi, '')
    .replace(/\s*\(mermaid syntax\)/gi, '')
    .replace(/^#{1,6}\s*```mermaid/gim, '### BPMN flow diagram\n\n```mermaid');

  return normalizeMarkdownForDocx(polished);
}

/**
 * Render a diagram at its natural (tightly cropped) size, then once more at 2x
 * resolution so it stays sharp when scaled into a Word page.
 */
export async function renderMermaidPngCrisp(
  code: string,
): Promise<Buffer | null> {
  const trimmed = sanitizeMermaidCode(code);
  if (!trimmed) return null;
  const fetchPng = async (query: string): Promise<Buffer | null> => {
    try {
      const response = await fetch(toMermaidInkUrl(trimmed, query), {
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        console.warn(`[word-export] mermaid.ink HTTP ${response.status}`);
        return null;
      }
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      console.warn(
        `[word-export] mermaid.ink request failed: ${error instanceof Error ? error.message : error}`,
      );
      return null;
    }
  };
  let natural: Buffer | null = null;
  for (let attempt = 0; attempt < 3 && !natural; attempt += 1) {
    if (attempt)
      await new Promise((resolve) => setTimeout(resolve, 1200 * attempt));
    natural = await fetchPng('type=png&bgColor=!ffffff');
  }
  if (!natural || natural.length < 24) return natural;
  const width = natural.readUInt32BE(16);
  const sharp = await fetchPng(
    `type=png&bgColor=!ffffff&width=${width}&scale=2`,
  );
  return sharp ?? natural;
}

/* ------------------------------------------------------------------ */
/* Local renderer (mermaid-cli + headless Chrome), no external service */
/* ------------------------------------------------------------------ */

const execFileLocal = promisify(execFile);

export function findChrome(): string | null {
  const configured = process.env.MERMAID_CHROME_PATH?.trim();
  if (configured && existsSync(configured)) return configured;
  const roots = [
    join(process.env.HOME || '/root', '.cache/puppeteer'),
    '/root/.cache/puppeteer',
    '/home/negt/.cache/puppeteer',
  ];
  for (const root of roots) {
    for (const [folder, binary] of [
      [
        'chrome-headless-shell',
        'chrome-headless-shell-linux64/chrome-headless-shell',
      ],
      ['chrome', 'chrome-linux64/chrome'],
    ] as const) {
      const base = join(root, folder);
      if (!existsSync(base)) continue;
      const versions = readdirSync(base).sort().reverse();
      for (const version of versions) {
        const candidate = join(base, version, binary);
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  return null;
}

function findMmdc(): string | null {
  const candidates = [
    join(__dirname, '../../tools/mermaid/node_modules/.bin/mmdc'),
    join(__dirname, '../../../tools/mermaid/node_modules/.bin/mmdc'),
    join(process.cwd(), 'tools/mermaid/node_modules/.bin/mmdc'),
  ];
  return candidates.find((item) => existsSync(item)) ?? null;
}

let localRendererDisabledUntil = 0;

/**
 * Renders a Mermaid diagram to PNG on this server. Returns null when the local
 * renderer is not installed or fails, so callers can fall back to another renderer.
 */
export async function renderMermaidPngLocal(
  code: string,
): Promise<Buffer | null> {
  const trimmed = sanitizeMermaidCode(code);
  if (!trimmed || Date.now() < localRendererDisabledUntil) return null;
  const mmdc = findMmdc();
  const chrome = findChrome();
  if (!mmdc || !chrome) {
    localRendererDisabledUntil = Date.now() + 5 * 60_000;
    return null;
  }
  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), 'bpm-mmd-'));
    const input = join(dir, 'flow.mmd');
    const output = join(dir, 'flow.png');
    const puppeteerConfig = join(dir, 'puppeteer.json');
    await writeFile(input, trimmed, 'utf8');
    await writeFile(
      puppeteerConfig,
      JSON.stringify({
        executablePath: chrome,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-gpu',
          '--disable-dev-shm-usage',
        ],
      }),
    );
    const mermaidConfig = join(dir, 'mermaid.json');
    await writeFile(
      mermaidConfig,
      JSON.stringify({
        theme: 'default',
        themeVariables: {
          fontFamily: 'Liberation Sans, Arial, Helvetica, sans-serif',
          fontSize: '15px',
        },
        flowchart: {
          useMaxWidth: false,
          nodeSpacing: 40,
          rankSpacing: 46,
          padding: 14,
          wrappingWidth: 220,
        },
      }),
    );
    await execFileLocal(
      mmdc,
      [
        '-i',
        input,
        '-o',
        output,
        '-p',
        puppeteerConfig,
        '-c',
        mermaidConfig,
        '-b',
        'white',
        '-s',
        '3',
      ],
      { timeout: 60_000, env: { ...process.env, HOME: dir } },
    );
    const png = await readFile(output);
    return png.length > 100 ? png : null;
  } catch (error) {
    const detail = String(
      (error as { stderr?: string }).stderr ??
        (error instanceof Error ? error.message : error),
    )
      .split('\n')
      .filter(Boolean)
      .slice(0, 6)
      .join(' | ');
    console.warn(
      `[word-export] local mermaid render failed: ${detail}\n${trimmed}`,
    );
    return null;
  } finally {
    if (dir)
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Local renderer first (reliable), the public renderer only as a backup. */
export async function renderMermaidPngBest(
  code: string,
): Promise<Buffer | null> {
  return (
    (await renderMermaidPngLocal(code)) ?? (await renderMermaidPngCrisp(code))
  );
}
