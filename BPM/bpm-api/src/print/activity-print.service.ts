import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { findChrome } from 'src/ai-bpm/ai-bpm-mermaid-images';

import type { ActivityPrintDto } from './activity-print.dto';

const run = promisify(execFile);

const esc = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** The HTML comes from our own React DOM, but is still stripped of anything executable. */
function safeHtml(html: string): string {
  return html
    .replace(
      /<\s*(script|iframe|object|embed|link|meta|style|form|base)[\s\S]*?<\s*\/\s*\1\s*>/gi,
      '',
    )
    .replace(
      /<\s*(script|iframe|object|embed|link|meta|style|form|base)[^>]*>/gi,
      '',
    )
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');
}

const ALLOWED_ORIGIN =
  /^https?:\/\/(localhost|127\.0\.0\.1|[\w.-]*neweast\.cloud)(:\d+)?$/i;

/** 960px wide keeps the dialog's responsive (md+) layout; ratio matches A4 portrait. */
const PAGE_W = 960;
const PAGE_H = 1358;

@Injectable()
export class ActivityPrintService {
  private readonly logger = new Logger(ActivityPrintService.name);
  private logoDataUri: string | null | undefined;

  async render(
    dto: ActivityPrintDto,
    origin?: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const chrome = findChrome();
    if (!chrome) {
      throw new ServiceUnavailableException(
        'PDF rendering is not available on this server.',
      );
    }
    const base =
      origin && ALLOWED_ORIGIN.test(origin)
        ? origin
        : 'https://bpm.neweast.cloud';
    const filename = (dto.filename || dto.title || 'sub-process')
      .replace(/[^\w.\- ]+/g, '_')
      .slice(0, 90);

    let dir: string | null = null;
    try {
      dir = await mkdtemp(join(tmpdir(), 'bpm-print-'));
      const html = join(dir, 'print.html');
      const pdf = join(dir, 'print.pdf');
      await writeFile(html, await this.buildHtml(dto, base), 'utf8');
      await run(
        chrome,
        [
          '--headless',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-gpu',
          '--disable-dev-shm-usage',
          '--no-pdf-header-footer',
          '--run-all-compositor-stages-before-draw',
          '--virtual-time-budget=4000',
          `--user-data-dir=${join(dir, 'profile')}`,
          `--print-to-pdf=${pdf}`,
          `file://${html}`,
        ],
        { timeout: 60_000, env: { ...process.env, HOME: dir } },
      );
      const buffer = await readFile(pdf);
      if (buffer.length < 500) throw new Error('empty PDF');
      return { buffer, filename };
    } catch (error) {
      this.logger.warn(
        `Activity PDF failed: ${error instanceof Error ? error.message : JSON.stringify(error)}`,
      );
      throw new ServiceUnavailableException('Could not build the PDF.');
    } finally {
      if (dir)
        await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async logo(): Promise<string | null> {
    if (this.logoDataUri !== undefined) return this.logoDataUri;
    const path = join(__dirname, '../../docx/logo/red_logo_new.png');
    if (!existsSync(path)) {
      this.logoDataUri = null;
      return null;
    }
    this.logoDataUri = `data:image/png;base64,${(await readFile(path)).toString('base64')}`;
    return this.logoDataUri;
  }

  private async buildHtml(
    dto: ActivityPrintDto,
    base: string,
  ): Promise<string> {
    const attrs = Object.entries(dto.htmlAttrs ?? {})
      .filter(
        ([k, v]) =>
          /^(class|data-[\w-]+)$/.test(k) && /^[\w\- ]{0,80}$/.test(String(v)),
      )
      .map(([k, v]) => `${k}="${esc(v)}"`)
      .join(' ');
    const font = (dto.fontFamily ?? '').replace(/[^\w\s,"'\-]/g, '');
    const watermark = esc(dto.watermark?.trim() || 'Draft');
    const logo = await this.logo();
    const meta = (dto.meta ?? [])
      .filter((m) => m.value?.trim())
      .map(
        (m) =>
          `<div class="pm"><span>${esc(m.label)}</span><strong>${esc(m.value)}</strong></div>`,
      )
      .join('');
    const printedAt = new Date().toLocaleString('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    return `<!DOCTYPE html>
<html lang="en" ${attrs}><head><meta charset="UTF-8" />
<base href="${esc(base)}/" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: ${esc(base)}; font-src data: ${esc(base)}; style-src 'unsafe-inline' ${esc(base)}" />
<title>${esc(dto.title)}</title>
<style>${dto.css.replace(/<\/style/gi, '')}</style>
<style>
  @page { size: ${PAGE_W}px ${PAGE_H}px; margin: 30px 34px; }
  html { background: #ffffff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0 !important; padding: 0 !important; background: transparent !important; ${font ? `font-family: ${font};` : ''} color: #1c252e; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .pdf-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; padding-bottom: 14px; margin-bottom: 18px; border-bottom: 2px solid #d32f2f; }
  .pdf-kicker { margin: 0; font-size: 11px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: #d32f2f; }
  .pdf-title { margin: 4px 0 2px; font-size: 22px; line-height: 1.3; font-weight: 700; }
  .pdf-sub { margin: 0; font-size: 13px; color: #637381; }
  .pdf-meta { display: flex; flex-wrap: wrap; gap: 6px 28px; margin-top: 10px; font-size: 12px; }
  .pm span { color: #919eab; margin-right: 6px; }
  .pdf-logo { height: 34px; width: auto; flex-shrink: 0; }
  .pdf-body > * + * { margin-top: 16px; }
  [data-print-card] { break-inside: avoid; page-break-inside: avoid; }
  .pdf-foot { margin-top: 22px; padding-top: 10px; border-top: 1px solid #e5d3d3; font-size: 10px; color: #919eab; }
  .wm { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 2147483647; }
  .wm span { font-size: 180px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; color: rgba(211, 47, 47, .10); transform: rotate(-32deg); white-space: nowrap; user-select: none; }
  button, [role="button"] { display: none !important; }
</style></head>
<body>
  <div class="wm"><span>${watermark}</span></div>
  <header class="pdf-head">
    <div>
      <p class="pdf-kicker">Sub-process</p>
      <h1 class="pdf-title">${esc(dto.title)}</h1>
      ${dto.subtitle ? `<p class="pdf-sub">${esc(dto.subtitle)}</p>` : ''}
      ${meta ? `<div class="pdf-meta">${meta}</div>` : ''}
    </div>
    ${logo ? `<img class="pdf-logo" src="${logo}" alt="NEWEAST" />` : ''}
  </header>
  <main class="pdf-body">${safeHtml(dto.bodyHtml)}</main>
  <div class="pdf-foot">Draft · Printed ${esc(printedAt)} · © NEWEAST · Confidential</div>
</body></html>`;
  }
}
