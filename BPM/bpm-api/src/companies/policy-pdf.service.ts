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

import {
  PolicyCreatorCatalogService,
  type PolicyCreatorPolicyDocument,
} from './policy-creator-catalog.service';

const run = promisify(execFile);

const esc = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const hasText = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .trim().length > 0;

/** Same clean-up Policy Creator applies before showing a topic's rich text. */
function normalizeHtml(html: string): string {
  const raw = String(html ?? '').trim();
  if (!hasText(raw)) return '';
  return raw
    .replace(/<p>(\s|&nbsp;|<br\s*\/?>)*<\/p>/gi, '')
    .replace(/<p>\s*[\u2022\u00b7*]\s+/gi, '<p class="policy-bullet">')
    .replace(/<(li|p)[^>]*>\s*[\u2022\u00b7*]\s+/gi, '<$1>')
    .replace(/(<br\s*\/?>\s*){3,}/gi, '<br /><br />');
}

/** Strips anything executable from the stored rich text. */
function safeHtml(html: string): string {
  return html
    .replace(
      /<\s*(script|iframe|object|embed|link|meta|style)[\s\S]*?<\s*\/\s*\1\s*>/gi,
      '',
    )
    .replace(/<\s*(script|iframe|object|embed|link|meta)[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');
}

const STYLES = `
  @page { size: A4; margin: 16mm 16mm 18mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; color: #0f172a; font-family: Calibri, "Liberation Sans", "Segoe UI", Arial, sans-serif; }
  .kicker { margin: 0; font-size: 11px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: #dc2626; }
  .header { display: flex; justify-content: space-between; gap: 24px; padding-bottom: 18px; border-bottom: 1px solid #e2e8f0; margin-bottom: 26px; }
  .title { font-size: 20px; font-weight: 700; line-height: 1.3; margin: 4px 0 0; }
  .logo { height: 36px; width: auto; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 32px; margin-top: 16px; font-size: 12.5px; }
  .meta-row { display: grid; grid-template-columns: 88px 1fr; gap: 8px; }
  .meta-row dt { color: #94a3b8; margin: 0; }
  .meta-row dd { color: #1e293b; margin: 0; }
  h2 { font-size: 15px; margin: 0 0 12px; line-height: 1.35; page-break-after: avoid; }
  .num { color: #dc2626; margin-right: 6px; }
  table { width: 100%; border-collapse: collapse; }
  .toc, .auth, .history, .body table { width: 100%; border-collapse: collapse; border: 1px solid #94a3b8; }
  .toc th, .auth th, .history th, .body th, .toc td, .auth td, .history td, .body td { border: 1px solid #94a3b8; padding: 8px 10px; text-align: left; vertical-align: top; }
  .toc th, .auth th, .history th, .body th { background: #f8fafc; font-size: 12px; font-weight: 600; color: #475569; }
  .toc td { font-size: 13px; }
  .doc-name { display: grid; grid-template-columns: 140px 1fr; gap: 16px; font-size: 13px; margin: 0 0 18px; }
  .doc-name dt { font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: #64748b; }
  .doc-name dd { font-weight: 500; margin: 0; }
  .block { margin: 0 0 28px; }
  .auth td, .history td { font-size: 12.5px; }
  .sig { font-family: "Brush Script MT", "Lucida Handwriting", cursive; color: #1e40af; font-size: 13px; }
  .muted { color: #94a3b8; }
  .label { margin: 0 0 8px; font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: #1e293b; }
  .section { margin: 0 0 26px; page-break-inside: avoid; }
  .body { font-size: 13.5px; line-height: 1.7; color: #334155; margin-top: 8px; }
  .body p { margin: 0 0 8px; }
  .body ul, .body ol { margin: 4px 0 8px; padding-left: 18px; }
  .body li { margin: 0 0 4px; }
  .body p.policy-bullet { padding-left: 16px; position: relative; }
  .body p.policy-bullet::before { content: "\\2022"; position: absolute; left: 0; color: #0f172a; }
  .body table { margin: 8px 0; }
  .topic-tree { margin: 8px 0 0 20px; padding-left: 14px; border-left: 2px solid #e2e8f0; }
  .rules-label { margin: 12px 0 6px; font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: #1e293b; }
  .rule-list { margin: 0; padding: 0 0 0 14px; border-left: 2px solid #e2e8f0; list-style: none; }
  .rule { display: flex; gap: 12px; margin: 8px 0; page-break-inside: avoid; }
  .rule-no { width: 36px; flex-shrink: 0; font-size: 13px; font-weight: 700; padding-top: 2px; }
  .rule-text { font-size: 13.5px; line-height: 1.7; color: #334155; }
  .empty-note { font-size: 13px; color: #94a3b8; font-style: italic; margin: 4px 0 0; }
  .status { display: inline-block; padding: 1px 8px; border-radius: 99px; background: #fef3c7; color: #92400e; font-size: 11.5px; font-weight: 600; }
  .footer { margin-top: 36px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; }
  th, td, .toc, .auth, .history { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
`;

const CACHE_TTL_MS = 2 * 60_000;

@Injectable()
export class PolicyPdfService {
  private readonly logger = new Logger(PolicyPdfService.name);
  private readonly cache = new Map<string, { at: number; buffer: Buffer }>();
  private logoDataUri: string | null | undefined;

  constructor(private readonly catalog: PolicyCreatorCatalogService) {}

  async render(
    policyId: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const policy = await this.catalog.getPolicyDocument(policyId);
    const filename = `${policy.documentMeta.documentCode || policy.name}`
      .replace(/[^\w.\- ]+/g, '_')
      .slice(0, 90);

    const hit = this.cache.get(policyId);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return { buffer: hit.buffer, filename };
    }

    const chrome = findChrome();
    if (!chrome) {
      throw new ServiceUnavailableException(
        'PDF rendering is not available on this server.',
      );
    }

    let dir: string | null = null;
    try {
      dir = await mkdtemp(join(tmpdir(), 'bpm-policy-'));
      const html = join(dir, 'policy.html');
      const pdf = join(dir, 'policy.pdf');
      await writeFile(html, await this.buildHtml(policy), 'utf8');
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
          `--user-data-dir=${join(dir, 'profile')}`,
          `--print-to-pdf=${pdf}`,
          `file://${html}`,
        ],
        { timeout: 60_000, env: { ...process.env, HOME: dir } },
      );
      const buffer = await readFile(pdf);
      if (buffer.length < 500) throw new Error('empty PDF');
      this.cache.set(policyId, { at: Date.now(), buffer });
      return { buffer, filename };
    } catch (error) {
      this.logger.warn(
        `Policy PDF failed for ${policyId}: ${error instanceof Error ? error.message : JSON.stringify(error)}`,
      );
      throw new ServiceUnavailableException('Could not build the policy PDF.');
    } finally {
      if (dir)
        await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async logo(): Promise<string | null> {
    if (this.logoDataUri !== undefined) return this.logoDataUri;
    const candidates = [
      process.env.POLICY_CREATOR_LOGO_PATH?.trim() ?? '',
      '/home/negt/policy_creator/public/logo.png',
      join(__dirname, '../../docx/logo/red_logo_new.png'),
    ].filter(Boolean);
    for (const path of candidates) {
      if (!existsSync(path)) continue;
      const data = await readFile(path);
      this.logoDataUri = `data:image/png;base64,${data.toString('base64')}`;
      return this.logoDataUri;
    }
    this.logoDataUri = null;
    return null;
  }

  private async buildHtml(
    policy: PolicyCreatorPolicyDocument,
  ): Promise<string> {
    const meta = policy.documentMeta;
    const toc = [
      { no: 1, title: 'Table of Contents' },
      { no: 2, title: 'Document Control' },
      ...policy.sections.map((section, index) => ({
        no: index + 3,
        title: section.title,
      })),
    ];
    const versionLabel = Number.isFinite(policy.version)
      ? `${policy.version}.0`
      : '1.0';
    const processLabel = [policy.processCode, policy.processName]
      .filter(Boolean)
      .join(' · ');
    const logo = await this.logo();
    const published = policy.status === 'published';

    const tocRows = toc
      .map(
        (item) =>
          `<tr><td style="width:42px;color:#64748b;">${item.no}</td><td>${esc(item.title)}</td></tr>`,
      )
      .join('');
    const authRows = meta.authorisers
      .map(
        (item) => `<tr>
          <td>${esc(item.label)}</td><td><strong>${esc(item.name)}</strong></td><td>${esc(item.role)}</td>
          <td>${item.signature ? `<span class="sig">${esc(item.signature)}</span>` : '<span class="muted">—</span>'}</td></tr>`,
      )
      .join('');
    const historyRows = meta.versionHistory
      .map(
        (row) =>
          `<tr><td>${esc(row.version)}</td><td>${esc(row.date)}</td><td>${esc(row.approvedBy)}</td><td>${esc(row.reason)}</td></tr>`,
      )
      .join('');

    const sections = policy.sections
      .map((section, index) => {
        const number = index + 3;
        const content = safeHtml(normalizeHtml(section.content));
        const rules = section.businessRules.length
          ? `<ol class="rule-list">${section.businessRules
              .map(
                (rule, i) =>
                  `<li class="rule"><div class="rule-no">${number}.${i + 1}</div><div class="rule-text">${esc(rule)}</div></li>`,
              )
              .join('')}</ol>`
          : '<p class="empty-note">No business rules added</p>';
        return `<section class="section">
          <h2><span class="num">${number}.</span>${esc(section.title)}</h2>
          <div class="topic-tree">
            ${hasText(content) ? `<div class="body">${content}</div>` : '<p class="empty-note">No topic content</p>'}
            <p class="rules-label">Business Rules</p>
            ${rules}
          </div></section>`;
      })
      .join('');

    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'" />
<title>${esc(meta.documentCode || policy.name)}</title><style>${STYLES}</style></head>
<body>
  <header class="header">
    <div>
      <p class="kicker">Policy document</p>
      <h1 class="title">${esc(meta.documentCode || policy.name)}</h1>
      <dl class="meta">
        <div class="meta-row"><dt>Company</dt><dd>${esc(policy.companyName || policy.companyCode || '—')}</dd></div>
        <div class="meta-row"><dt>Department</dt><dd>${esc(policy.departmentName || '—')}</dd></div>
        <div class="meta-row"><dt>Visibility</dt><dd>${esc(meta.visibility)}</dd></div>
        <div class="meta-row"><dt>Version</dt><dd>v${esc(versionLabel)}${published ? '' : ` <span class="status">${esc(policy.status.replace(/_/g, ' '))}</span>`}</dd></div>
      </dl>
    </div>
    ${logo ? `<img class="logo" src="${logo}" alt="NEWEAST" />` : ''}
  </header>
  <section class="block"><h2><span class="num">1.</span>Table of Contents</h2>
    <table class="toc"><thead><tr><th style="width:42px;">No.</th><th>Contents</th></tr></thead><tbody>${tocRows}</tbody></table></section>
  <section class="block"><h2><span class="num">2.</span>Document Control</h2>
    <dl class="doc-name"><dt>Document name</dt><dd>${esc(policy.name)}</dd></dl>
    <p class="label">Authorisation</p>
    <table class="auth"><thead><tr><th>Role</th><th>Name</th><th>Title</th><th>Signature</th></tr></thead><tbody>${authRows}</tbody></table>
    <p style="margin:16px 0 18px;font-size:13px;"><strong>Distribution list:</strong> ${esc(meta.distributionList)}</p>
    <p class="label">Version history</p>
    <table class="history"><thead><tr><th>Version</th><th>Date</th><th>Approved By</th><th>Changes &amp; Reason for Change</th></tr></thead><tbody>${historyRows}</tbody></table>
    ${meta.effectiveDate && meta.effectiveDate !== '—' ? `<p style="margin:10px 0 0;font-size:11px;color:#64748b;">Effective date: ${esc(meta.effectiveDate)}</p>` : ''}
  </section>
  ${processLabel ? `<p style="margin:0 0 18px;font-size:12.5px;"><strong>Linked process:</strong> ${esc(processLabel)}</p>` : ''}
  ${sections}
  <div class="footer">Confidential · Internal use only · © NEWEAST · Version ${esc(versionLabel)}</div>
</body></html>`;
  }
}
