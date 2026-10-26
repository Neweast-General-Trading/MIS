import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Repository } from 'typeorm';

import { parseApprovalFlow } from 'src/common/activity-template-field-types';
import { findChrome } from 'src/ai-bpm/ai-bpm-mermaid-images';
import { ActivityTemplateEntity } from 'src/activity-templates/entities/activity-template.entity';
import { Department } from 'src/departments/entities/department.entity';
import { DepartmentsService } from 'src/departments/departments.service';

const run = promisify(execFile);

type Field = {
  key: string;
  label: string;
  type: string;
  options?: string[];
};

type RelatedSub = {
  id: string;
  code: string;
  activityName: string;
  processId: string;
  processName: string;
  departmentId: string;
  departmentName: string;
};

type RelatedPolicy = {
  policyName: string;
  policyVersion: number | null;
  policyCreatorUrl: string | null;
};

type Sub = {
  id: string;
  code: string;
  sln: number;
  activityName: string;
  activityDescription: string | null;
  parentActivityId: string | null;
  details: Record<string, string | string[]>;
  owners: string[];
  status: string;
  createdAt: string;
  relatedSubProcesses?: RelatedSub[];
  relatedPolicies?: RelatedPolicy[];
};

const esc = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const norm = (s: unknown) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/** Escapes the text and turns http(s) URLs into clickable links (kept as links inside the PDF). */
function linkify(text: string): string {
  return esc(text).replace(/(https?:\/\/[^\s<>"']+)/g, (raw) => {
    const trailing = raw.match(/[.,;:)\]]+$/)?.[0] ?? '';
    const url = trailing ? raw.slice(0, -trailing.length) : raw;
    return `<a href="${url}">${url}</a>${trailing}`;
  });
}

function asText(v: unknown): string {
  if (Array.isArray(v))
    return v
      .map((x) => String(x ?? '').trim())
      .filter(Boolean)
      .join(', ');
  return String(v ?? '').trim();
}

function items(v: unknown): string[] {
  if (Array.isArray(v))
    return v.map((x) => String(x ?? '').trim()).filter(Boolean);
  return String(v ?? '')
    .split(/[,;|]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function compareCodes(a: { code: string }, b: { code: string }) {
  const pa = a.code.split('-').map((s) => Number.parseInt(s, 10));
  const pb = b.code.split('-').map((s) => Number.parseInt(s, 10));
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Field layout (mirrors the sub-process details dialog)
// ---------------------------------------------------------------------------

type GroupDef = {
  id: string;
  title: string;
  color: string;
  names: string[];
  cols: number;
};

const GROUPS: GroupDef[] = [
  {
    id: 'classification',
    title: 'Classification',
    color: '#0288d1',
    cols: 4,
    names: [
      'activitytype',
      'scopeinoutoftheprocess',
      'orchestrationtype',
      'noofftesinteractions',
    ],
  },
  {
    id: 'timing',
    title: 'Timing & execution',
    color: '#f59e0b',
    cols: 4,
    names: [
      'tat',
      'tatminutes',
      'waitdelaytime',
      'waitdelaytimeminutes',
      'processtype',
      'frequency',
    ],
  },
  {
    id: 'roles',
    title: 'Roles (RACI)',
    color: '#e53935',
    cols: 4,
    names: [
      'responsible',
      'accountable',
      'consulted',
      'informed',
      'verificationvi',
      'signatorysi',
    ],
  },
  {
    id: 'systems',
    title: 'Systems & applications',
    color: '#2e9e5b',
    cols: 2,
    names: ['support', 'systemapplicationimpacted', 'systemtoolused'],
  },
];

const ROLE_TILES: Record<string, { letter: string; color: string }> = {
  responsible: { letter: 'R', color: '#e53935' },
  accountable: { letter: 'A', color: '#f59e0b' },
  consulted: { letter: 'C', color: '#0288d1' },
  informed: { letter: 'I', color: '#2e9e5b' },
  verificationvi: { letter: 'VI', color: '#7e57c2' },
  signatorysi: { letter: 'SI', color: '#3949ab' },
};

const SHORT_TYPES = new Set([
  'dropdown',
  'dropdown_multiselect',
  'dropdown_job_title',
  'dropdown_person_name',
  'app_master',
  'oracle_job_role_multi',
  'person_multi',
  'job_title',
  'number',
  'numeric_days',
  'yes_no',
  'boolean',
]);
const MULTI_TYPES = new Set([
  'person_multi',
  'dropdown_multiselect',
  'oracle_job_role_multi',
  'app_master',
]);

const SKIP_NAMES = new Set([
  'sino',
  'activityid',
  'processid',
  'subprocessid',
  'activityname',
  'subprocessname',
  'activitydescription',
  'subprocessdescription',
]);

function groupOf(f: Field): { def: GroupDef; order: number } | null {
  for (const def of GROUPS) {
    const a = def.names.indexOf(norm(f.label));
    const idx = a >= 0 ? a : def.names.indexOf(norm(f.key));
    if (idx >= 0) return { def, order: idx };
  }
  return null;
}

function valueFor(f: Field, raw: unknown): string {
  let text = asText(raw);
  if (f.type === 'numeric_days') {
    text = text.replace(/\s*(days?|minutes?|mins?|hrs?|hours?)\s*$/i, '');
  }
  return text;
}

const STATUS_COLORS: Record<string, string> = {
  draft: '#b76e00',
  confirmed: '#118d57',
  'in progress': '#006c9c',
  done: '#118d57',
};

const ALLOWED_ORIGIN =
  /^https?:\/\/(localhost|127\.0\.0\.1|[\w.-]*neweast\.cloud)(:\d+)?$/i;

const CSS = `
  @page { size: A4; margin: 16mm 14mm 18mm;
    @bottom-left { content: "Draft · Confidential · NEWEAST"; font: 8pt Arial, sans-serif; color: #919eab; }
    @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 8pt Arial, sans-serif; color: #919eab; } }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; color: #1c252e; font-family: Calibri, "Liberation Sans", "Segoe UI", Arial, sans-serif; font-size: 10pt; line-height: 1.45; }
  a { color: #0b5cad; text-decoration: underline; word-break: break-all; }
  .wm { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 2147483647; }
  .wm span { font-size: 150pt; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: rgba(211, 47, 47, .075); transform: rotate(-32deg); white-space: nowrap; }

  .doc-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; padding-bottom: 12px; border-bottom: 2.5px solid #d32f2f; }
  .kicker { margin: 0; font-size: 8.5pt; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; color: #d32f2f; }
  .doc-title { margin: 3px 0 2px; font-size: 21pt; line-height: 1.2; font-weight: 700; }
  .doc-sub { margin: 0; color: #637381; font-size: 10.5pt; }
  .logo { height: 30px; width: auto; flex-shrink: 0; }
  .facts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 14px 0 6px; }
  .fact { border: 1px solid #e6d6d6; background: #fdf6f6; border-radius: 8px; padding: 8px 10px; }
  .fact span { display: block; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .08em; color: #919eab; }
  .fact strong { display: block; font-size: 11pt; margin-top: 2px; word-break: break-word; }
  .desc { margin: 10px 0 0; padding: 10px 12px; border-left: 3px solid #d32f2f; background: #fbf4f4; border-radius: 0 8px 8px 0; white-space: pre-wrap; }

  h2.section-title { margin: 18px 0 8px; font-size: 12.5pt; color: #d32f2f; letter-spacing: .02em; break-after: avoid; }
  table.toc { width: 100%; border-collapse: collapse; font-size: 9pt; }
  table.toc th { text-align: left; background: #fbeaea; color: #7a1f1f; font-size: 8pt; text-transform: uppercase; letter-spacing: .06em; padding: 5px 8px; }
  table.toc td { padding: 4px 8px; border-bottom: 1px solid #f0e2e2; vertical-align: top; }
  table.toc tr { break-inside: avoid; }
  .code { font-family: "Liberation Mono", "DejaVu Sans Mono", monospace; font-size: 8.5pt; white-space: nowrap; }

  .sp { margin: 0 0 14px; padding: 0; border: 1px solid #ead7d7; border-radius: 10px; background: #fff; overflow: hidden; break-inside: avoid-page; }
  .sp.child { margin-left: 18px; }
  .sp-head { display: flex; align-items: center; gap: 10px; padding: 9px 12px; background: linear-gradient(90deg, #fbeaea, #fdf6f6); border-bottom: 1px solid #ead7d7; }
  .sp-code { font-family: "Liberation Mono", "DejaVu Sans Mono", monospace; font-size: 8.5pt; font-weight: 700; color: #fff; background: #d32f2f; border-radius: 6px; padding: 2px 7px; white-space: nowrap; }
  .sp-name { margin: 0; font-size: 12pt; line-height: 1.3; flex: 1; }
  .badge { font-size: 8pt; font-weight: 700; padding: 2px 9px; border-radius: 99px; border: 1px solid currentColor; white-space: nowrap; }
  .sp-body { padding: 10px 12px 12px; }
  .sp-meta { margin: 0 0 8px; font-size: 8.5pt; color: #637381; }
  .sp-desc { margin: 0 0 10px; white-space: pre-wrap; }
  .grp { margin: 0 0 9px; padding: 7px 9px 9px; border: 1px solid #efe3e3; border-left-width: 4px; border-radius: 8px; background: #fffafa; break-inside: avoid; }
  .grp-title { margin: 0 0 6px; font-size: 8.5pt; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
  .grid { display: grid; gap: 6px; }
  .cell { border: 1px solid #efe3e3; background: #fff; border-radius: 6px; padding: 5px 8px; min-width: 0; }
  .cell .lb { display: block; font-size: 7.5pt; font-weight: 700; color: #3d4752; line-height: 1.25; }
  .cell .vl { display: block; margin-top: 2px; font-weight: 400; word-break: break-word; }
  .muted { color: #b0b8c1; font-weight: 400; }
  .chip { display: inline-block; margin: 1px 3px 1px 0; padding: 1px 8px; border-radius: 99px; border: 1px solid #c4cdd5; background: #fff; font-size: 8.5pt; font-weight: 400; }
  .tile { border-top-width: 3px; border-top-style: solid; border-radius: 6px; padding: 6px 8px; }
  .tile .hd { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; font-weight: 700; font-size: 9pt; }
  .tile .lt { min-width: 20px; height: 20px; padding: 0 4px; border-radius: 5px; color: #fff; font-size: 8.5pt; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; }
  .sub-label { margin: 8px 0 5px; font-size: 7.5pt; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #637381; }
  .long { margin: 0 0 7px; padding: 6px 9px; border-left: 3px solid #e3cccc; background: #fcf7f7; border-radius: 0 6px 6px 0; break-inside: avoid; }
  .long .lb { display: block; font-size: 7.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #3d4752; }
  .long .vl { white-space: pre-wrap; font-weight: 400; }
  .flow { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; }
  .flow .step { border: 1px solid #c9b8e8; background: #f4effc; border-radius: 99px; padding: 2px 10px; font-size: 9pt; }
  .flow .arrow { color: #7e57c2; font-weight: 700; }
  .links { margin: 8px 0 0; padding: 6px 9px; border: 1px dashed #d9c0c0; border-radius: 8px; break-inside: avoid; }
  .links h4 { margin: 0 0 4px; font-size: 8pt; text-transform: uppercase; letter-spacing: .08em; color: #637381; }
  .links ul { margin: 0; padding-left: 16px; }
  .links li { margin: 1px 0; }
`;

@Injectable()
export class ProcessPrintService {
  private readonly logger = new Logger(ProcessPrintService.name);
  private logoDataUri: string | null | undefined;

  constructor(
    private readonly departmentsService: DepartmentsService,
    @InjectRepository(ActivityTemplateEntity)
    private readonly templateRepository: Repository<ActivityTemplateEntity>,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
  ) {}

  async render(
    departmentId: string,
    processId: string,
    requestingUserEmail: string | null,
    originHint?: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const chrome = findChrome();
    if (!chrome) {
      throw new ServiceUnavailableException(
        'PDF rendering is not available on this server.',
      );
    }
    const process = (await this.departmentsService.findProcess(
      departmentId,
      processId,
      requestingUserEmail,
    )) as unknown as {
      id: string;
      code: string;
      processName: string;
      name: string;
      companyCode: string;
      description: string | null;
      processDescription: string | null;
      processOwners: string[];
      activityTemplateId: string | null;
      activityTemplateName: string | null;
      activities: Sub[];
    };
    const department = await this.departmentRepository.findOne({
      where: { id: departmentId },
    });
    if (!process || !department)
      throw new NotFoundException('Process not found.');
    const template = process.activityTemplateId
      ? await this.templateRepository.findOne({
          where: { id: process.activityTemplateId },
        })
      : null;

    const base =
      originHint && ALLOWED_ORIGIN.test(originHint)
        ? originHint
        : 'https://bpm.neweast.cloud';
    const html = await this.buildHtml({
      process,
      department,
      fields: (template?.fields ?? []) as Field[],
      base,
      departmentId,
    });
    const filename = `${process.code}-${process.processName}`
      .replace(/[^\w.\- ]+/g, '_')
      .slice(0, 90);

    return { buffer: await this.htmlToPdf(chrome, html, processId), filename };
  }

  private async htmlToPdf(
    chrome: string,
    html: string,
    label: string,
  ): Promise<Buffer> {
    let dir: string | null = null;
    try {
      dir = await mkdtemp(join(tmpdir(), 'bpm-process-print-'));
      const htmlPath = join(dir, 'process.html');
      const pdf = join(dir, 'process.pdf');
      await writeFile(htmlPath, html, 'utf8');
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
          `file://${htmlPath}`,
        ],
        { timeout: 420_000, env: { ...global.process.env, HOME: dir } },
      );
      const buffer = await readFile(pdf);
      if (buffer.length < 500) throw new Error('empty PDF');
      return buffer;
    } catch (error) {
      this.logger.warn(
        `Process PDF failed for ${label}: ${error instanceof Error ? error.message : JSON.stringify(error)}`,
      );
      throw new ServiceUnavailableException('Could not build the process PDF.');
    } finally {
      if (dir)
        await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /** PDF of a whole process function: every process inside it and all their sub-processes. */
  async renderDepartment(
    departmentId: string,
    requestingUserEmail: string | null,
    originHint?: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const chrome = findChrome();
    if (!chrome) {
      throw new ServiceUnavailableException(
        'PDF rendering is not available on this server.',
      );
    }
    const dept = (await this.departmentsService.findOne(
      departmentId,
      requestingUserEmail,
    )) as unknown as {
      id: string;
      code: string;
      name: string;
      companyCode: string;
      processes?: Array<{ id: string; code: string }>;
    };
    if (!dept) throw new NotFoundException('Process function not found.');
    const base =
      originHint && ALLOWED_ORIGIN.test(originHint)
        ? originHint
        : 'https://bpm.neweast.cloud';

    type Loaded = {
      id: string;
      code: string;
      processName: string;
      description: string | null;
      processDescription: string | null;
      processOwners: string[];
      activityTemplateId: string | null;
      activityTemplateName: string | null;
      activities: Sub[];
    };
    const list = [...(dept.processes ?? [])].sort(compareCodes);
    const templateFields = new Map<string, Field[]>();
    const processes: Array<{ p: Loaded; fields: Field[]; subs: Sub[] }> = [];
    for (const item of list) {
      const p = (await this.departmentsService.findProcess(
        departmentId,
        item.id,
        requestingUserEmail,
      )) as unknown as Loaded;
      let fields: Field[] = [];
      if (p.activityTemplateId) {
        if (!templateFields.has(p.activityTemplateId)) {
          const t = await this.templateRepository.findOne({
            where: { id: p.activityTemplateId },
          });
          templateFields.set(
            p.activityTemplateId,
            (t?.fields ?? []) as Field[],
          );
        }
        fields = templateFields.get(p.activityTemplateId) ?? [];
      }
      processes.push({
        p,
        fields,
        subs: [...(p.activities ?? [])].sort(compareCodes),
      });
    }

    const logo = await this.logo();
    const printed = new Date().toLocaleString('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    const totalSubs = processes.reduce((n, x) => n + x.subs.length, 0);
    const deptName = dept.name.startsWith(dept.code)
      ? dept.name
      : `${dept.code} ${dept.name}`;
    const deptUrl = `${base}/departments/${departmentId}/processes`;

    const toc = processes
      .map(({ p, subs }) => {
        const head = `<tr class="toc-proc"><td class="code"><a href="#pr-${esc(p.id)}">${esc(p.code)}</a></td><td><a href="#pr-${esc(p.id)}">${esc(p.processName)}</a></td><td style="text-align:right">${subs.length}</td></tr>`;
        const rows = subs
          .map((s) => {
            const color =
              STATUS_COLORS[(s.status || 'Draft').toLowerCase()] ?? '#637381';
            return `<tr><td class="code" style="padding-left:20px"><a href="#sp-${esc(s.id)}">${esc(s.code)}</a></td><td style="padding-left:${s.parentActivityId ? 26 : 8}px">${esc(s.activityName)}</td><td style="color:${color};font-weight:700;text-align:right">${esc(s.status || 'Draft')}</td></tr>`;
          })
          .join('');
        return head + rows;
      })
      .join('');

    const body = processes
      .map(({ p, fields, subs }, index) => {
        const byId = new Map(subs.map((s) => [s.id, s]));
        const description = (
          p.processDescription ||
          p.description ||
          ''
        ).trim();
        const url = `${base}/departments/${departmentId}/processes/${p.id}/activities-table`;
        return `<section class="proc">
          <div class="proc-head" id="pr-${esc(p.id)}">
            <p class="kicker">Process ${index + 1} of ${processes.length}</p>
            <h2 class="proc-title"><span class="code">${esc(p.code)}</span> ${esc(p.processName)}</h2>
            <p class="proc-sub">${subs.length} sub-process${subs.length === 1 ? '' : 'es'}${p.processOwners?.length ? ` &nbsp;·&nbsp; Owners: ${esc(p.processOwners.join(', '))}` : ''}${p.activityTemplateName ? ` &nbsp;·&nbsp; Template: ${esc(p.activityTemplateName)}` : ''}</p>
            ${description ? `<p class="desc">${linkify(description)}</p>` : ''}
            <p class="proc-link">Open in BPM: <a href="${esc(url)}">${esc(url)}</a></p>
          </div>
          ${subs.length ? subs.map((s) => this.renderSub(s, fields, { base, departmentId, processId: p.id, byId })).join('\n') : '<p class="muted">No sub-processes yet.</p>'}
        </section>`;
      })
      .join('\n');

    const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'" />
<title>${esc(deptName)}</title>
<style>${CSS}
  .proc { break-before: page; }
  .proc-head { margin: 0 0 12px; padding: 12px 14px; border: 1px solid #ecc9c9; border-left: 5px solid #d32f2f; border-radius: 10px; background: #fbf1f1; break-inside: avoid; break-after: avoid; }
  .proc-head .kicker { margin: 0 0 3px; }
  .proc-title { margin: 0; font-size: 15pt; line-height: 1.25; color: #1c252e; }
  .proc-sub { margin: 4px 0 0; font-size: 9pt; color: #637381; }
  .proc-link { margin: 6px 0 0; font-size: 8pt; color: #637381; word-break: break-all; }
  .proc-head .desc { margin-top: 8px; background: #fff; }
  tr.toc-proc td { background: #fbeaea; font-weight: 700; border-bottom: 1px solid #ecc9c9; padding-top: 6px; }
  tr.toc-proc a { color: #7a1f1f; }
</style></head>
<body>
  <div class="wm"><span>Draft</span></div>
  <header class="doc-head">
    <div>
      <p class="kicker">Process function documentation</p>
      <h1 class="doc-title">${esc(dept.name.startsWith(dept.code) ? dept.name.slice(dept.code.length).replace(/^[\s_\-:]+/, '') || dept.name : dept.name)}</h1>
      <p class="doc-sub"><span class="code">${esc(dept.code)}</span> &nbsp;·&nbsp; ${esc(dept.companyCode)}</p>
    </div>
    ${logo ? `<img class="logo" src="${logo}" alt="NEWEAST" />` : ''}
  </header>
  <section class="facts">
    <div class="fact"><span>Processes</span><strong>${processes.length}</strong></div>
    <div class="fact"><span>Sub-processes</span><strong>${totalSubs}</strong></div>
    <div class="fact"><span>Company</span><strong>${esc(dept.companyCode)}</strong></div>
    <div class="fact"><span>Printed</span><strong>${esc(printed)}</strong></div>
  </section>
  <p style="margin:8px 0 0;font-size:8.5pt;color:#637381">Open in BPM: <a href="${esc(deptUrl)}">${esc(deptUrl)}</a></p>
  <h2 class="section-title">Contents</h2>
  <table class="toc"><thead><tr><th style="width:150px">ID</th><th>Process / sub-process</th><th style="width:80px;text-align:right">Sub-proc. / status</th></tr></thead><tbody>${toc || '<tr><td colspan="3" class="muted">No processes yet.</td></tr>'}</tbody></table>
  ${body}
</body></html>`;

    const filename = `${dept.code}-${dept.name}`
      .replace(/[^\w.\- ]+/g, '_')
      .slice(0, 90);
    return {
      buffer: await this.htmlToPdf(chrome, html, departmentId),
      filename,
    };
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

  // ------------------------------------------------------------------------

  private cell(f: Field, raw: unknown, chips: boolean): string {
    const text = valueFor(f, raw);
    let body: string;
    if (!text) body = '<span class="vl muted">—</span>';
    else if (chips || MULTI_TYPES.has(f.type))
      body = `<span class="vl">${items(raw)
        .map((i) => `<span class="chip">${esc(i)}</span>`)
        .join('')}</span>`;
    else body = `<span class="vl">${linkify(text)}</span>`;
    return `<div class="cell"><span class="lb">${esc(f.label)}</span>${body}</div>`;
  }

  private tile(f: Field, raw: unknown): string {
    const meta = ROLE_TILES[norm(f.label)] ?? ROLE_TILES[norm(f.key)];
    const color = meta?.color ?? '#637381';
    const list = items(raw);
    const body = list.length
      ? list.map((i) => `<span class="chip">${esc(i)}</span>`).join('')
      : '<span class="muted">—</span>';
    return `<div class="cell tile" style="border-top-color:${color};background:${color}12">
      <div class="hd"><span class="lt" style="background:${color}">${esc(meta?.letter ?? f.label.slice(0, 1).toUpperCase())}</span>${esc(f.label)}</div>${body}</div>`;
  }

  private grid(cols: number, count: number, cells: string): string {
    return `<div class="grid" style="grid-template-columns:repeat(${Math.max(1, Math.min(cols, count))},1fr)">${cells}</div>`;
  }

  private renderSub(
    sub: Sub,
    fields: Field[],
    ctx: {
      base: string;
      departmentId: string;
      processId: string;
      byId: Map<string, Sub>;
    },
  ): string {
    const details = sub.details ?? {};
    const raw = (f: Field) => details[f.key];

    const grouped = new Map<string, Array<{ f: Field; order: number }>>();
    const full: Field[] = [];
    const other: Field[] = [];
    let descriptionFromField = '';
    const dataFields: Field[] = [];
    const approvalFields: Field[] = [];

    for (const f of fields) {
      const n = norm(f.label);
      const k = norm(f.key);
      if (
        n === 'activitydescription' ||
        n === 'subprocessdescription' ||
        k === 'activitydescription'
      ) {
        descriptionFromField = asText(raw(f));
        continue;
      }
      if (SKIP_NAMES.has(n) || SKIP_NAMES.has(k)) continue;
      if (f.type === 'approval_flow') {
        approvalFields.push(f);
        continue;
      }
      if (
        ['data', 'datainformation'].includes(n) ||
        ['data', 'datainformation'].includes(k)
      ) {
        if (valueFor(f, raw(f))) dataFields.push(f);
        continue;
      }
      const g = groupOf(f);
      if (g) {
        grouped.set(g.def.id, [
          ...(grouped.get(g.def.id) ?? []),
          { f, order: g.order },
        ]);
        continue;
      }
      const v = valueFor(f, raw(f));
      if (!v) continue;
      const short =
        !n.startsWith('exception') &&
        (SHORT_TYPES.has(f.type) || (v.length <= 48 && !v.includes('\n')));
      (short ? other : full).push(f);
    }

    const parts: string[] = [];
    for (const def of GROUPS) {
      const list = (grouped.get(def.id) ?? [])
        .sort((a, b) => a.order - b.order)
        .map((x) => x.f);
      if (!list.length) continue;
      // Skip a card whose fields are all empty.
      if (!list.some((f) => valueFor(f, raw(f)))) continue;
      let inner: string;
      if (def.id === 'roles') {
        const isRaci = (f: Field) =>
          ['R', 'A', 'C', 'I'].includes(
            (ROLE_TILES[norm(f.label)] ?? ROLE_TILES[norm(f.key)])?.letter ??
              '',
          );
        const raci = list.filter(isRaci);
        const sign = list.filter((f) => !isRaci(f));
        inner =
          (raci.length
            ? this.grid(
                4,
                raci.length,
                raci.map((f) => this.tile(f, raw(f))).join(''),
              )
            : '') +
          (sign.length
            ? `${raci.length ? '<div class="sub-label">Verification &amp; sign-off</div>' : ''}${this.grid(
                2,
                sign.length,
                sign.map((f) => this.tile(f, raw(f))).join(''),
              )}`
            : '');
      } else {
        inner = this.grid(
          def.cols,
          list.length,
          list.map((f) => this.cell(f, raw(f), def.id === 'systems')).join(''),
        );
      }
      parts.push(
        `<section class="grp" style="border-left-color:${def.color}"><h4 class="grp-title" style="color:${def.color}">${def.title}</h4>${inner}</section>`,
      );
    }
    for (const f of approvalFields) {
      const raw0 = raw(f);
      const filled = Array.isArray(raw0)
        ? raw0.length > 0
        : String(raw0 ?? '').trim().length > 0;
      if (!filled) continue;
      const { enabled, levels } = parseApprovalFlow(raw0);
      const body = !enabled
        ? '<span class="muted">No approval flow</span>'
        : levels.length
          ? `<div class="flow">${levels
              .map(
                (role, i) =>
                  `${i > 0 ? '<span class="arrow">→</span>' : ''}<span class="step"><b>L${i + 1}</b> ${esc(role)}</span>`,
              )
              .join('')}</div>`
          : '<span class="vl">Yes</span>';
      parts.push(
        `<section class="grp" style="border-left-color:#7e57c2"><h4 class="grp-title" style="color:#7e57c2">${esc(f.label)}</h4>${body}</section>`,
      );
    }
    if (other.length) {
      parts.push(
        `<section class="grp" style="border-left-color:#d32f2f"><h4 class="grp-title" style="color:#d32f2f">Other details</h4>${this.grid(
          3,
          other.length,
          other.map((f) => this.cell(f, raw(f), false)).join(''),
        )}</section>`,
      );
    }
    // Exception fields always come last.
    const isExc = (f: Field) =>
      norm(f.label).startsWith('exception') || norm(f.key).startsWith('exception');
    full.sort((x, y) => Number(isExc(x)) - Number(isExc(y)));
    for (const f of full) {
      parts.push(
        `<div class="long"><span class="lb">${esc(f.label)}</span><div class="vl">${linkify(valueFor(f, raw(f)))}</div></div>`,
      );
    }

    const subUrl = (departmentId: string, processId: string, id: string) =>
      `${ctx.base}/departments/${departmentId}/processes/${processId}/activities-table?activity=${encodeURIComponent(id)}`;

    const related = sub.relatedSubProcesses ?? [];
    if (related.length) {
      parts.push(
        `<div class="links"><h4>Related sub-processes</h4><ul>${related
          .map(
            (r) =>
              `<li><a href="${esc(subUrl(r.departmentId, r.processId, r.id))}"><span class="code">${esc(r.code)}</span> ${esc(r.activityName)}</a> <span class="muted">— ${esc(r.processName)}</span></li>`,
          )
          .join('')}</ul></div>`,
      );
    }
    const policies = sub.relatedPolicies ?? [];
    if (policies.length) {
      parts.push(
        `<div class="links"><h4>Related policies</h4><ul>${policies
          .map((p) => {
            const label = `${esc(p.policyName)}${p.policyVersion ? ` <span class="muted">v${esc(p.policyVersion)}</span>` : ''}`;
            return `<li>${p.policyCreatorUrl ? `<a href="${esc(p.policyCreatorUrl)}">${label}</a>` : label}</li>`;
          })
          .join('')}</ul></div>`,
      );
    }

    const status = sub.status || 'Draft';
    const color = STATUS_COLORS[status.toLowerCase()] ?? '#637381';
    const description = (
      sub.activityDescription ||
      descriptionFromField ||
      ''
    ).trim();
    const parent = sub.parentActivityId
      ? ctx.byId.get(sub.parentActivityId)
      : null;
    const metaBits = [
      parent
        ? `Sub-process of <a href="#sp-${esc(parent.id)}"><span class="code">${esc(parent.code)}</span> ${esc(parent.activityName)}</a>`
        : '',
      sub.owners?.length ? `Owners: ${esc(sub.owners.join(', '))}` : '',
    ].filter(Boolean);

    return `<article class="sp${parent ? ' child' : ''}" id="sp-${esc(sub.id)}">
      <header class="sp-head"><span class="sp-code">${esc(sub.code)}</span><h3 class="sp-name">${esc(sub.activityName)}</h3><span class="badge" style="color:${color}">${esc(status)}</span></header>
      <div class="sp-body">
        ${metaBits.length ? `<p class="sp-meta">${metaBits.join(' &nbsp;·&nbsp; ')}</p>` : ''}
        ${description ? `<p class="sp-desc">${linkify(description)}</p>` : ''}
        ${dataFields.map((f) => `<div class="long"><span class="lb">${esc(f.label)}</span><div class="vl">${linkify(valueFor(f, raw(f)))}</div></div>`).join('')}
        ${parts.join('')}
      </div></article>`;
  }

  private async buildHtml(args: {
    process: {
      id: string;
      code: string;
      processName: string;
      companyCode: string;
      description: string | null;
      processDescription: string | null;
      processOwners: string[];
      activityTemplateName: string | null;
      activities: Sub[];
    };
    department: Department;
    fields: Field[];
    base: string;
    departmentId: string;
  }): Promise<string> {
    const { process, department, fields, base, departmentId } = args;
    const subs = [...(process.activities ?? [])].sort(compareCodes);
    const byId = new Map(subs.map((s) => [s.id, s]));
    const logo = await this.logo();
    const printed = new Date().toLocaleString('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    const processUrl = `${base}/departments/${departmentId}/processes/${process.id}/activities-table`;
    const description = (
      process.processDescription ||
      process.description ||
      ''
    ).trim();

    const toc = subs
      .map((s) => {
        const color =
          STATUS_COLORS[(s.status || 'Draft').toLowerCase()] ?? '#637381';
        return `<tr><td class="code"><a href="#sp-${esc(s.id)}">${esc(s.code)}</a></td><td style="padding-left:${s.parentActivityId ? 18 : 8}px">${esc(s.activityName)}</td><td style="color:${color};font-weight:700">${esc(s.status || 'Draft')}</td></tr>`;
      })
      .join('');
    const body = subs
      .map((s) =>
        this.renderSub(s, fields, {
          base,
          departmentId,
          processId: process.id,
          byId,
        }),
      )
      .join('\n');

    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'" />
<title>${esc(process.code)} ${esc(process.processName)}</title>
<style>${CSS}</style></head>
<body>
  <div class="wm"><span>Draft</span></div>
  <header class="doc-head">
    <div>
      <p class="kicker">Process documentation</p>
      <h1 class="doc-title">${esc(process.processName)}</h1>
      <p class="doc-sub"><span class="code">${esc(process.code)}</span> &nbsp;·&nbsp; ${esc(department.name.startsWith(department.code) ? department.name : `${department.code} ${department.name}`)} &nbsp;·&nbsp; ${esc(process.companyCode)}</p>
    </div>
    ${logo ? `<img class="logo" src="${logo}" alt="NEWEAST" />` : ''}
  </header>
  <section class="facts">
    <div class="fact"><span>Sub-processes</span><strong>${subs.length}</strong></div>
    <div class="fact"><span>Process owners</span><strong>${esc(process.processOwners?.join(', ') || '—')}</strong></div>
    <div class="fact"><span>Template</span><strong>${esc(process.activityTemplateName || '—')}</strong></div>
    <div class="fact"><span>Printed</span><strong>${esc(printed)}</strong></div>
  </section>
  ${description ? `<p class="desc">${linkify(description)}</p>` : ''}
  <p style="margin:8px 0 0;font-size:8.5pt;color:#637381">Open in BPM: <a href="${esc(processUrl)}">${esc(processUrl)}</a></p>
  <h2 class="section-title">Contents</h2>
  <table class="toc"><thead><tr><th style="width:140px">ID</th><th>Sub-process</th><th style="width:80px">Status</th></tr></thead><tbody>${toc || '<tr><td colspan="3" class="muted">No sub-processes yet.</td></tr>'}</tbody></table>
  <h2 class="section-title" style="break-before:page">Sub-processes</h2>
  ${body}
</body></html>`;
  }
}
