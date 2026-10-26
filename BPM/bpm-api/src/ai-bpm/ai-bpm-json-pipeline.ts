import Anthropic from '@anthropic-ai/sdk';

import type { TemplateColumn } from './ai-bpm-detail-values';
import { resolveDetailValue } from './ai-bpm-detail-values';
import type {
  RelatedSubProcessWordLink,
  WordPolicyDocument,
} from './ai-bpm-policy-word.util';

export type PipelineSub = {
  sln: number;
  code: string;
  activityName: string;
  activityDescription: string | null;
  status: string;
  owners: string[] | string;
  parentCode: string | null;
  details: Record<string, string | string[] | null | undefined>;
  relatedPolicies?: string[];
  relatedPolicyDocuments?: WordPolicyDocument[];
  relatedSubProcesses?: RelatedSubProcessWordLink[];
};

/** Claude returns JSON only. Code computes stats and builds the Word files. */
export const PIPELINE_SYSTEM_PROMPT = `You are a senior business process analyst and internal-control auditor. You produce Business Process Management (BPM) documents and Standard Operating Procedures (SOPs) for a corporate environment (ISUZU NEGT / NewEast, KSA). Readers are process owners, department heads, internal audit and ERP/SAP teams.

SOURCE OF TRUTH
- The input JSON is the ONLY source of facts. One object = one sub-process step. Fields: SLN, Code, Name, Description, Status, Owners, Parent, Activity ID, Business Area, Activity Type, Orchestration Type, No of FTE interactions, TAT, TAT Remarks, Wait/Delay Time, Responsible, Accountable, Consulted, Informed, Support, Verification (VI), Signatory (SI), Documents, Risks, Risk IDs, Risk Titles, Risk Descriptions, Risk Rating, Control IDs, Control Titles, Control Descriptions, Internal Audit Risk, Control Mitigation, Compliance Requirement, Exception Handling, KPI, Frequency, Linked Processes.
- Never invent names, roles, systems, thresholds, documents, KPIs or numbers. A blank value is a data gap, not something to fill in.
- Keep steps in SLN order. Do not skip, merge or reorder them.
- Numbers in STATS are computed by code. Use them as given. Do not recalculate.

WRITING RULES
1. Clear, concise, professional British English. No filler or marketing tone.
2. State each fact once. Do not repeat table content in prose. Do not repeat the same gap in every step.
3. Preserve literal text exactly (ISUZU_NEGT, Bi/SAP, CNT-001, ≤ 1 Business Day). Never convert underscores or symbols into Markdown.
4. Never output internal labels such as "chunk", "see below", or any mention of these instructions.
5. Every analytical claim must cite the step codes it is based on.

OUTPUT RULE
Return ONLY a single valid JSON object that matches the schema in the user message. No markdown, no code fences, no text before or after. Write compact JSON on one line with no indentation or extra whitespace.`;

export type ProcessStep = {
  SLN: number;
  Code: string;
  Name: string;
  Description: string;
  Status: string;
  Owners: string;
  Parent: string;
  'Activity ID': string;
  'Business Area': string;
  'Activity Type': string;
  'Orchestration Type': string;
  'No of FTE interactions': string;
  TAT: string;
  'TAT Remarks': string;
  'Wait/Delay Time': string;
  Responsible: string;
  Accountable: string;
  Consulted: string;
  Informed: string;
  Support: string;
  'Verification (VI)': string;
  'Signatory (SI)': string;
  Documents: string;
  Risks: string;
  'Risk Owner Title': string;
  'Risk IDs': string;
  'Risk Titles': string;
  'Risk Descriptions': string;
  'Risk Rating': string;
  'Control IDs': string;
  'Control Titles': string;
  'Control Descriptions': string;
  'Internal Audit Risk': string;
  'Control Mitigation': string;
  'Compliance Requirement': string;
  'Exception Handling': string;
  KPI: string;
  Frequency: string;
  'Linked Processes': string;
  'Business Role': string;
  'Wait/Delay Time Remarks': string;
  'Control Mitigation Description': string;
};

/** Column names as they appear in the BPM templates. Matching ignores case and punctuation. */
const DETAIL_ALIASES: Record<keyof ProcessStep, string[]> = {
  SLN: ['SLN'],
  Code: ['Code', 'Activity ID'],
  Name: ['Activity Name', 'Name'],
  Description: ['Activity Description', 'Description'],
  Status: ['Status'],
  Owners: ['Owners'],
  Parent: ['Parent'],
  'Activity ID': ['Activity ID'],
  'Business Area': ['Business Area'],
  'Activity Type': ['Activity Type'],
  'Orchestration Type': ['Orchestration Type'],
  'No of FTE interactions': [
    "No Of FTE's Interactions",
    'No of FTE interactions',
    'FTE interactions',
  ],
  TAT: ['TAT', 'TAT (Days)', 'TAT Days'],
  'TAT Remarks': ['TAT Remarks'],
  'Wait/Delay Time': [
    'Wait/Delay Time',
    'Wait/Delay Time (Minutes)',
    'wait / Delay Time',
  ],
  'Wait/Delay Time Remarks': [
    'Wait/Delay Time Remarks',
    'wait / Delay Time Remarks',
  ],
  Responsible: ['Responsible', 'Responsible-Role'],
  Accountable: ['Accountable'],
  Consulted: ['Consulted'],
  Informed: ['Informed'],
  Support: ['Support'],
  'Verification (VI)': ['Verification (VI)', 'Verify (VI)'],
  'Signatory (SI)': ['Signatory (SI)'],
  Documents: ['Documents', 'Document'],
  Risks: ['Risks'],
  'Risk Owner Title': ['Risks Title-Process Owner'],
  'Risk IDs': ["Risk ID's", 'Risk IDs', 'Risk ID'],
  'Risk Titles': ['Risks Title', 'Risk Titles', 'Risk Title'],
  'Risk Descriptions': ['Risk Descriptions', 'Risk Description'],
  'Risk Rating': ['Risk Rating/Impact', 'Risk Rating', 'Risk Impact'],
  'Control IDs': ["Control ID's", 'Control IDs', 'Control ID'],
  'Control Titles': ['Control Titles', 'Control Title', 'Controls', 'Control'],
  'Control Descriptions': ['Control Descriptions', 'Control Description'],
  'Internal Audit Risk': [
    'Risks-Internal Audit',
    'Internal Audit Risk',
    'Risks Internal Audit',
  ],
  'Control Mitigation': [
    'Controls Mitigation Title',
    'Control Mitigation Title',
    'Control Mitigation',
  ],
  'Control Mitigation Description': [
    'Control Mitigation Descriptions',
    'Control Mitigation Description',
  ],
  'Compliance Requirement': ['Compliance Requirement'],
  'Exception Handling': ['Exception Handling'],
  KPI: ['KPI / Performance Metric', 'KPI', 'Performance Metric'],
  Frequency: ['Frequency'],
  'Linked Processes': ['Linked Processes / Dependencies', 'Linked Processes'],
  'Business Role': ['Business Role'],
};

const normaliseKey = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]/g, '');

function detailValue(
  details: PipelineSub['details'],
  aliases: string[],
): string {
  const folded = new Map<string, string>();
  for (const [key, raw] of Object.entries(details ?? {})) {
    const value = Array.isArray(raw)
      ? raw.filter(Boolean).join(', ')
      : String(raw ?? '').trim();
    if (value) folded.set(normaliseKey(key), value);
  }
  for (const alias of aliases) {
    const hit = folded.get(normaliseKey(alias));
    if (hit) return hit;
  }
  return '';
}

export function toProcessJson(subs: PipelineSub[]): ProcessStep[] {
  return subs
    .slice()
    .sort((a, b) => a.sln - b.sln || a.code.localeCompare(b.code))
    .map((sub) => {
      const step = {} as ProcessStep;
      for (const key of Object.keys(DETAIL_ALIASES) as (keyof ProcessStep)[]) {
        if (key === 'SLN') step.SLN = sub.sln;
        else if (key === 'Code') step.Code = sub.code;
        else if (key === 'Name') {
          step.Name =
            sub.activityName || detailValue(sub.details, DETAIL_ALIASES.Name);
        } else if (key === 'Description') {
          step.Description =
            sub.activityDescription ||
            detailValue(sub.details, DETAIL_ALIASES.Description);
        } else if (key === 'Status') step.Status = sub.status || '';
        else if (key === 'Owners') {
          step.Owners = Array.isArray(sub.owners)
            ? sub.owners.filter(Boolean).join(', ')
            : sub.owners || '';
        } else if (key === 'Parent') step.Parent = sub.parentCode || '';
        else if (key === 'Linked Processes') {
          step['Linked Processes'] =
            detailValue(sub.details, DETAIL_ALIASES['Linked Processes']) ||
            (sub.relatedPolicies ?? []).join(', ');
        } else {
          (step as Record<string, string | number>)[key] = detailValue(
            sub.details,
            DETAIL_ALIASES[key],
          );
        }
      }
      return step;
    });
}

export function computeStats(steps: ProcessStep[]) {
  const n = steps.length || 1;
  const roleCounts = new Map<string, string[]>();
  for (const step of steps) {
    for (const role of step.Responsible.split(/[/,;]/)
      .map((p) => p.trim())
      .filter(Boolean)) {
      const codes = roleCounts.get(role) ?? [];
      codes.push(step.Code);
      roleCounts.set(role, codes);
    }
  }
  const blank = (field: keyof ProcessStep) =>
    steps.filter((s) => !String(s[field] ?? '').trim()).length;
  const countBy = (pick: (s: ProcessStep) => string) => {
    const out: Record<string, number> = {};
    for (const step of steps) {
      const key = pick(step).trim() || 'Not set';
      out[key] = (out[key] ?? 0) + 1;
    }
    return out;
  };
  const controlIds = new Set(
    steps.flatMap((s) =>
      s['Control IDs']
        .split(/[,;/\s]+/)
        .map((c) => c.trim())
        .filter(Boolean),
    ),
  );
  return {
    step_count: steps.length,
    rating_counts: countBy((s) => s['Risk Rating']),
    activity_type_counts: countBy((s) => s['Activity Type']),
    orchestration_counts: countBy((s) => s['Orchestration Type']),
    distinct_control_ids: controlIds.size,
    steps_with_controls: steps.filter((s) => s['Control IDs'].trim()).length,
    role_shares: [...roleCounts.entries()].map(([role, codes]) => ({
      role,
      step_count: codes.length,
      share_pct: Math.round((codes.length / n) * 1000) / 10,
      steps: codes,
    })),
    blank_field_counts: {
      Name: blank('Name'),
      Description: blank('Description'),
      Responsible: blank('Responsible'),
      Accountable: blank('Accountable'),
      'Risk Rating': blank('Risk Rating'),
      'Control IDs': blank('Control IDs'),
    },
  };
}

function neighbour(steps: ProcessStep[], index: number, delta: number): string {
  const other = steps[index + delta];
  if (!other) return 'none';
  return `${other.Code} ${other.Name}`.trim();
}

export function extractTerms(steps: ProcessStep[]): string[] {
  const terms = new Set<string>();
  const add = (value: string) => {
    for (const part of value
      .split(/[/,;]/)
      .map((p) => p.trim())
      .filter((p) => p.length > 1)) {
      terms.add(part);
    }
  };
  for (const step of steps) {
    add(step.Responsible);
    add(step.Accountable);
    add(step.Consulted);
    add(step.Informed);
    add(step['Verification (VI)']);
    add(step['Orchestration Type']);
    add(step['Business Area']);
    for (const match of `${step.Description} ${step.Name}`.matchAll(
      /\b[A-Z][A-Z0-9/&-]{1,}\b/g,
    )) {
      terms.add(match[0]);
    }
  }
  return [...terms].sort((a, b) => a.localeCompare(b));
}

export type PipelineField = { label: string; value: string };

export type PipelineBundle = {
  process: ProcessStep[];
  stats: ReturnType<typeof computeStats>;
  findings: Record<string, unknown>;
  narratives: Record<string, unknown>[];
  swimlane: Record<string, unknown>;
  executive: Record<string, unknown>;
  glossary: { terms?: { term: string; definition: string }[] };
  /** Filled by the SOP phase (empty until the user asks for the SOP). */
  sopSteps: Record<string, unknown>[];
  /** SOP front matter: purpose, scope, roles, rules, escalation. */
  sop?: Record<string, unknown>;
  /** Summary SOP content. */
  summary?: Record<string, unknown>;
  overview: Record<string, unknown>;
  /** Every template field of each step, in template order (same index as `process`). */
  fields: PipelineField[][];
  /** Policy Creator documents linked to each step. */
  policies: WordPolicyDocument[][];
  /** Integrated sub-processes linked to each step. */
  integrated: RelatedSubProcessWordLink[][];
};

const P2 = `TASK: Perform the cross-step analysis of this process.

INPUT: {process_json}
STATS: {stats_json}

Analyse:
- Segregation of duties: same role as Responsible and Verifier, or holding A+C+I+VI.
- Sequence logic: ordering risks (e.g. payment before goods receipt, missing three-way match).
- Workload concentration: roles above 40% of steps.
- Decision points: steps whose description implies a branch, and where each branch leads.
- Cycle time: maximum end-to-end duration from step TATs, and bottlenecks.
- High-rated risk steps with their control IDs.

SCHEMA:
{"segregation_of_duties":[{"steps":[""],"issue":"","risk":"","recommendation":""}],
 "sequence_risks":[{"steps":[""],"issue":"","risk":"","recommendation":""}],
 "workload_concentration":[{"role":"","steps":[""],"share_pct":0,"observation":""}],
 "decision_points":[{"after_step":"","question":"","yes_goes_to":"","no_goes_to":""}],
 "cycle_time":{"max_end_to_end":"","bottlenecks":[""]},
 "high_risk_steps":[{"code":"","control_id":"","why_high":""}]}

Only include findings supported by the data. Group related steps into ONE entry instead of repeating the same finding per step. Maximum 8 entries in each list (decision_points maximum 12, high_risk_steps maximum 15). Maximum 45 words per text field. Empty arrays are valid.`;

const P3 = `TASK: Write the narrative for ONE step.

STEP: {step_json}
PREVIOUS STEP: {prev_code_name}
NEXT STEP: {next_code_name}

Do NOT mention blank fields. Do NOT repeat table values.

SCHEMA:
{"code":"",
 "purpose":"1 sentence: why this step exists",
 "how_it_works":"2-3 sentences: actor, action, system, handoff to next step",
 "control_rationale":"1-2 sentences: what the control prevents and how it is evidenced",
 "watch_out":"1 sentence: main failure mode and the exception rule"}

Maximum 90 words in total.`;

const P4 = `TASK: Produce the swimlane structure.

INPUT: {process_json}
DECISIONS (from analysis): {decision_points_json}

Rules:
- One lane per distinct Responsible role. If a step has "A / B", place it in both lanes.
- Steps in SLN order.
- Each step gets a short action label (maximum 6 words, verb first).
- Include handoffs between consecutive steps.
- Add decision nodes only from the DECISIONS list.

SCHEMA:
{"lanes":[{"role":""}],
 "nodes":[{"id":"","code":"","label":"","lane":"","risk_rating":""}],
 "decisions":[{"id":"","after":"","question":"","lane":""}],
 "edges":[{"from":"","to":"","label":""}]}`;

const P5 = `TASK: Write the executive summary.

STATS: {stats_json}
FINDINGS: {findings_json}

SCHEMA:
{"purpose":"2 sentences: what the process achieves and for whom",
 "key_facts":["max 5, each under 25 words, with numbers from STATS"],
 "top_risks":["max 3: finding + step codes + business impact"],
 "recommendations":["max 4, each starts with a verb and is tied to a finding"]}

Do not mention blank, missing or incomplete fields.
Total maximum 180 words. Use only numbers from STATS.`;

const P6 = `TASK: Build the glossary.

TERMS FOUND IN DATA: {extracted_terms_list}
(roles, systems, acronyms, control prefixes, policies, orchestration types)

Define each term in one sentence based on how it is used in this process.
- Standard business acronyms (BPM, SOP, RACI, TAT, FTE, HOD): use the standard meaning.
- Internal codes (e.g. H-S-H): define only if the data explains them; otherwise write "Definition not provided in BPM data".

SCHEMA:
{"terms":[{"term":"","definition":""}]}

Alphabetical order.`;

const P_OVERVIEW = `TASK: Write the process overview.

INPUT: {process_json}
STATS: {stats_json}

Describe the process only from the data. Do not repeat table values.

SCHEMA:
{"objective":"1-2 sentences: what the process achieves",
 "trigger":"1 sentence: what starts it, taken from the first step",
 "outcome":"1 sentence: what is produced or decided at the last step",
 "scope":"1-2 sentences: departments, systems and business areas involved",
 "phases":[{"name":"","steps":["codes"],"summary":"1 sentence"}],
 "systems":["systems or applications named in the data"],
 "policies":["policies, compliance requirements or standards named in the data"]}

Maximum 3 to 6 phases that group consecutive steps in SLN order. Maximum 150 words in total.`;

const SOP_STYLE = `Style: formal SOP language, present tense, terse. Use only roles, systems, policies and controls named in the data. Never invent limits, forms or approvals. Never write "Not defined", "Not recorded", "N/A" or similar placeholders: leave the field empty instead.`;

const P_SOP_ROWS = `TASK: Turn these process steps into rows of an SOP procedure table.

PROCESS: {process_name}
STEPS: {steps_json}

${SOP_STYLE}

For each step return ONE row:
- "n": the SLN of the step, unchanged.
- "step": the step title as a short imperative phrase, maximum 8 words (shorten the Name; keep its meaning).
- "by": who performs it (Responsible, or Business Role if Responsible is empty). Role names exactly as in the data.
- "verified_by": who verifies or approves it (Verification, Accountable, Signatory). Several roles are separated by "; ".
- "tat": the turnaround in a short form such as "30 min", "1–2 h", "1 day". Empty if the data has none.
- "key_actions": what is done and which checks apply, as one terse line of maximum 30 words, items separated by "; ". Fold the controls and compliance requirements into it. No full sentences, no numbering.

SCHEMA:
{"rows":[{"n":1,"step":"","by":"","verified_by":"","tat":"","key_actions":""}]}

Return exactly one row per step, in the same order.`;

const P_MASTER_FRONT = `TASK: Write the opening of the master Standard Operating Procedure (SOP).

{digest}

${SOP_STYLE}

SCHEMA:
{"title":"document title without codes, for example: Finance & Accounts — Master Standard Operating Procedure (for a single process: <process name> — Standard Operating Procedure)",
 "purpose":"2-3 sentences: one standard way to do the work in these processes",
 "in_scope":"1-2 sentences naming what the processes cover",
 "out_of_scope":"1-2 sentences: what is handed off to other processes or departments, citing sub-process codes if the data names them; empty if nothing",
 "prerequisites":"1-2 sentences: access, systems, policies staff need before starting",
 "primary_policy":"policy names found in the data, separated by "; "; empty if none",
 "areas":[{"process":"ref exactly as given","area":"2-3 word business area for the process"}]}`;

const P_MASTER_ROLES = `TASK: Consolidate the roles of these processes into one roles table.

{digest}

${SOP_STYLE}

Merge duplicates and variants of the same role (for example a role and its manager) only when the data clearly treats them as one; otherwise keep them separate. Order from the most operational to the most senior.

SCHEMA:
{"roles":[{"role":"role name as in the data","names":["every spelling of this role found in the data, exactly as written"],"responsibilities":"one sentence, maximum 25 words, what the role does across the processes","processes":["ref"]}]}

"processes" lists the refs (exactly as given) of the processes where the role appears. If the role appears in every process use ["All"]. Maximum 30 roles.`;

const P_MASTER_DEFS = `TASK: List the terms and systems a reader needs to follow these processes.

{digest}

${SOP_STYLE}

Only include abbreviations, business terms and systems that actually appear in the data and that a new employee would not already know. Explain abbreviations with their standard meaning; skip a term if you are not sure what it means.
Do NOT include: role names, policy names, step names, RACI letters (R, A, C, I, V, S), "NA", or generic words. Do NOT mention step numbers or codes in a meaning.

SCHEMA:
{"definitions":[{"term":"","meaning":"maximum 25 words"}],
 "systems":[{"system":"","used_for":"maximum 20 words, from how the data uses it"}]}

Maximum 40 definitions sorted alphabetically, maximum 15 systems.`;

const P_MASTER_RULES = `TASK: Write the cross-process rules, key controls, exception table and record table of the master SOP.

{digest}

${SOP_STYLE}

State once what repeats across processes. Every item must be traceable to the steps in the data.
- A rule is an obligation ("must" / "must not") that the data states or clearly implies through its controls, policies, compliance requirements or verification fields. Do not restate what a step does. If the data supports only a few rules, return only those. Do NOT put step numbers or process codes in a rule.
- A control is an actual check, validation, approval, screening, reconciliation or segregation measure named in the data (Control, Compliance, Verification, Signatory fields). A step that merely performs work is not a control. If the data names no controls, return an empty list.
- An exception is a situation the data says needs special handling (Exception Handling field, rejection, hold, mismatch, limit breach). Do not invent escalation paths. If none, return an empty list.
- A record is a document, register or system entry that the data names (Documents field or step text). Do not list every step's output.

SCHEMA:
{"rules":[{"lead":"2-4 word imperative, for example Log before you work","text":"1-2 sentences"}],
 "controls":[{"control":"what is checked, maximum 14 words","applied":[{"process":"ref exactly as given","steps":[1,2]}],"applies_to_all":"only if the control applies to every step of a kind, say which, otherwise empty","evidence":"what proves it was done"}],
 "exceptions":[{"situation":"","action":"","escalate_to":"role from the data"}],
 "records":[{"record":"","held_in":"register, system or repository named in the data"}]}

"steps" are SLN numbers of steps in that process. Maximum 10 rules, 12 controls, 16 exceptions, 10 records.`;

const P_MASTER_OPEN = `TASK: List the open items that the process owners must resolve before this SOP is approved.

{digest}

CHECKS ALREADY FOUND BY THE SYSTEM:
{hints}

${SOP_STYLE}

Skip trivial style issues such as capitalisation. Add problems you find in the data: values the data refers to without giving them (limits, tolerances, deadlines, retention periods), roles marked "to be confirmed", a performer that cannot be right for the step, step actions that do not fit the step title, and labels or codes that look wrong. Keep the system's checks that are real. Every item must cite a process ref and step number or code, and say what to confirm or fix.

SCHEMA:
{"open_items":["one sentence each, maximum 35 words"]}

Maximum 12 items, most important first. An empty list is valid.`;

const P_SUMMARY = `TASK: Write the one-to-two page Summary SOP (quick reference) for this process.

INPUT: {process_json}
OVERVIEW: {overview_json}
STATS: {stats_json}

The reader needs the whole process on one page. Merge consecutive steps that belong together. Do not list every step.

SCHEMA:
{"purpose":"1-2 sentences, maximum 40 words",
 "use_when":"1 sentence: when someone should follow this process, maximum 25 words",
 "key_steps":[{"no":1,"step":"imperative sentence, maximum 18 words","owner":"role from the data","covers":["step codes this key step merges"]}],
 "roles":[{"role":"","does":"maximum 20 words"}],
 "key_controls":["maximum 20 words each, citing control IDs or step codes"],
 "records":["records or documents produced; maximum 5"],
 "watch_outs":["the most important failure modes or exception rules; maximum 5, each under 25 words"],
 "escalation":"maximum 30 words"}

{limits} Every step code must appear in exactly one key step. Empty arrays are valid.`;

function fill(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{([a-z_]+)\}/g, (_, key: string) => {
    const value = vars[key];
    return typeof value === 'string' ? value : JSON.stringify(value ?? null);
  });
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const cleaned = raw
    .trim()
    .replace(/^```json/i, '')
    .replace(/^```/, '')
    .replace(/```$/, '')
    .trim();
  const attempts = [cleaned];
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first >= 0 && last > first) attempts.push(cleaned.slice(first, last + 1));
  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate) as Record<string, unknown>;
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function callJson(
  client: Anthropic,
  userPrompt: string,
  maxTokens: number,
): Promise<Record<string, unknown>> {
  const preferred = process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-6';
  const requested =
    process.env.ANTHROPIC_PIPELINE_MODEL?.trim() || 'claude-sonnet-5-5';
  const models = requested === preferred ? [requested] : [requested, preferred];
  let lastRaw = '';
  let lastError: unknown;
  for (const model of models) {
    let budget = maxTokens;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const t0 = Date.now();
        const response = await client.messages.create({
          model,
          max_tokens: budget,
          ...(/sonnet-4|haiku|opus-4-5/.test(model)
            ? { temperature: 0.1 }
            : {}),
          // claude-sonnet-5 thinks by default and spends the output budget on it. JSON tasks do not need that.
          ...(/sonnet-5/.test(model)
            ? { thinking: { type: 'between_tools' as never } }
            : {}),
          system: [
            {
              type: 'text',
              text: PIPELINE_SYSTEM_PROMPT,
              cache_control: { type: 'ephemeral' },
            },
          ],
          messages: [{ role: 'user', content: userPrompt }],
        });
        const text = response.content
          .filter((block) => block.type === 'text')
          .map((block) => block.text)
          .join('\n');
        lastRaw = text;
        if (process.env.BPM_PIPELINE_DEBUG)
          console.log(
            `[pipeline] ${model} ${((Date.now() - t0) / 1000).toFixed(1)}s out=${response.usage?.output_tokens} budget=${budget} prompt=${userPrompt.slice(0, 40).replace(/\n/g, ' ')}`,
          );
        const parsed = extractJsonObject(text);
        if (parsed) return parsed;
        // Output was cut off or malformed: retry with a larger budget.
        budget = Math.min(budget * 2, 16000);
      } catch (err) {
        lastError = err;
        const status = (err as { status?: number }).status ?? 0;
        const message = err instanceof Error ? err.message : String(err);
        if (
          (status === 404 || /not_found|model/i.test(message)) &&
          model !== preferred
        )
          break;
        if (status === 429 || status >= 500) await sleep(2500 * (attempt + 1));
      }
    }
  }
  console.error(
    'BPM pipeline JSON parse failed',
    lastRaw.slice(0, 500),
    lastError,
  );
  throw new Error('Automation returned invalid JSON for a generation step.');
}

export type PipelineProgress = {
  stage:
    | 'prepare'
    | 'analysis'
    | 'narratives'
    | 'structure'
    | 'sop'
    | 'summary'
    | 'jd'
    | 'build';
  label: string;
  percent: number;
};

export async function mapInBatches<T, R>(
  items: T[],
  size: number,
  fn: (item: T, index: number) => Promise<R>,
  onBatch?: (completed: number, total: number) => void,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const slice = items.slice(i, i + size);
    const part = await Promise.all(
      slice.map((item, offset) => fn(item, i + offset)),
    );
    out.push(...part);
    onBatch?.(out.length, items.length);
  }
  return out;
}

export async function runBpmPipeline(
  client: Anthropic,
  subs: PipelineSub[],
  onProgress?: (update: PipelineProgress) => void,
  options?: { columns?: TemplateColumn[] },
): Promise<PipelineBundle> {
  const report = (update: PipelineProgress) => onProgress?.(update);
  report({ stage: 'prepare', label: 'Preparing the process data', percent: 4 });
  const ordered = subs
    .slice()
    .sort((a, b) => a.sln - b.sln || a.code.localeCompare(b.code));
  const process = toProcessJson(ordered);
  const stats = computeStats(process);
  const fields = ordered.map((sub) => collectFields(sub, options?.columns));
  const policies = ordered.map((sub) => sub.relatedPolicyDocuments ?? []);
  const integrated = ordered.map((sub) => sub.relatedSubProcesses ?? []);

  report({
    stage: 'analysis',
    label: 'Analysing the process across steps',
    percent: 12,
  });
  const [findings, narratives] = await Promise.all([
    callJson(
      client,
      fill(P2, { process_json: process, stats_json: stats }),
      5000,
    ),
    mapInBatches(
      process,
      8,
      (step, index) =>
        callJson(
          client,
          fill(P3, {
            step_json: step,
            prev_code_name: neighbour(process, index, -1),
            next_code_name: neighbour(process, index, 1),
          }),
          1500,
        ),
      (completed, total) =>
        report({
          stage: 'narratives',
          label: `Writing step narratives (${completed} of ${total})`,
          percent: 18 + Math.round((completed / Math.max(total, 1)) * 44),
        }),
    ),
  ]);

  const decisions = Array.isArray(findings.decision_points)
    ? findings.decision_points
    : [];
  report({
    stage: 'structure',
    label: 'Building the swimlane, summary and glossary',
    percent: 66,
  });
  const terms = extractTerms(process);
  const [swimlane, executive, glossary, overview] = await Promise.all([
    callJson(
      client,
      fill(P4, { process_json: process, decision_points_json: decisions }),
      Math.min(16000, 2000 + process.length * 130),
    ),
    callJson(
      client,
      fill(P5, { stats_json: stats, findings_json: findings }),
      2500,
    ),
    callJson(
      client,
      fill(P6, { extracted_terms_list: terms }),
      Math.min(8000, 1500 + terms.length * 30),
    ),
    callJson(
      client,
      fill(P_OVERVIEW, { process_json: process, stats_json: stats }),
      2000,
    ),
  ]);

  return {
    process,
    stats,
    findings,
    narratives,
    swimlane,
    executive,
    glossary: glossary as PipelineBundle['glossary'],
    sopSteps: [],
    overview,
    fields,
    policies,
    integrated,
  };
}

/** Every template field of one step, in template order, with its stored value. */
function collectFields(
  sub: PipelineSub,
  columns?: TemplateColumn[],
): PipelineField[] {
  const details = sub.details as Record<string, unknown>;
  const cols: TemplateColumn[] = columns?.length
    ? columns
    : Object.keys(details ?? {}).map((key) => ({ key, label: key }));
  return cols.map((column) => {
    const folded = column.label.toLowerCase().replace(/[^a-z0-9]/g, '');
    let value = resolveDetailValue(details, column);
    if (!value && folded === 'activityname') value = sub.activityName ?? '';
    if (!value && folded === 'activitydescription')
      value = sub.activityDescription ?? '';
    if (!value && folded === 'activityid') value = sub.code;
    return { label: column.label, value: value.trim() };
  });
}

export type SopNamedBundle = { label: string; bundle: PipelineBundle };

export type SopMaster = {
  /** Short reference per process, aligned with the bundles, e.g. "005-001". */
  refs: string[];
  front: {
    title: string;
    purpose: string;
    inScope: string;
    outOfScope: string;
    prerequisites: string;
    primaryPolicy: string;
    areas: Record<string, string>;
  };
  roles: {
    role: string;
    /** Every spelling of the role in the BPM data, so a matrix can be counted from the steps. */
    names: string[];
    responsibilities: string;
    processes: string[];
  }[];
  definitions: { term: string; meaning: string }[];
  systems: { system: string; usedFor: string }[];
  rules: { lead: string; text: string }[];
  controls: {
    control: string;
    applied: { process: string; steps: number[] }[];
    appliesToAll: string;
    evidence: string;
  }[];
  exceptions: { situation: string; action: string; escalateTo: string }[];
  records: { record: string; heldIn: string }[];
  openItems: string[];
};

const text = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';
/** Rules and definitions must read on their own: drop "(005-001, s13)" style pointers the model sometimes adds. */
const scrub = (value: string): string =>
  value
    .replace(/\s*\((?:[^()]*\b\d{3}-\d{3}\b[^()]*|[^()]*\bs\d+\b[^()]*)\)/g, '')
    .replace(/\s+([.,;])/g, '$1')
    .trim();
const listOf = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? (value.filter((v) => v && typeof v === 'object') as Record<
        string,
        unknown
      >[])
    : [];

/** "AP Trade Process (005-001-001-000)" -> ref "005-001", name "AP Trade Process". */
function processRef(
  label: string,
  fallbackIndex: number,
): { ref: string; name: string } {
  const match = label.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
  const name = (match ? match[1] : label).trim();
  const code = match ? match[2].trim() : '';
  const groups = code.split('-');
  const ref =
    groups.length >= 3
      ? groups.slice(0, 2).join('-')
      : code || `P${fallbackIndex + 1}`;
  return { ref, name };
}

/** One short reference per process, unique across the document. */
function uniqueRefs(named: SopNamedBundle[]): { ref: string; name: string }[] {
  const refs = named.map((item, index) => processRef(item.label, index));
  const used = new Set<string>();
  refs.forEach((entry, index) => {
    if (used.has(entry.ref)) {
      const full = named[index].label.match(/\(([^()]+)\)\s*$/)?.[1]?.trim();
      entry.ref = full && !used.has(full) ? full : `${entry.ref}-${index + 1}`;
    }
    used.add(entry.ref);
  });
  return refs;
}

const clip = (value: string, max: number) =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;

function stepLine(step: ProcessStep): string {
  const parts = [
    `s${step.SLN}`,
    clip(step.Name, 90),
    step.Responsible && `R: ${clip(step.Responsible, 60)}`,
    step.Accountable && `A: ${clip(step.Accountable, 60)}`,
    step['Verification (VI)'] && `V: ${clip(step['Verification (VI)'], 60)}`,
    step['Signatory (SI)'] && `S: ${clip(step['Signatory (SI)'], 60)}`,
    step.Support && `sys: ${clip(step.Support, 50)}`,
    step.TAT && `TAT: ${clip(step.TAT, 30)}`,
    (step['Control Descriptions'] ||
      step['Control Titles'] ||
      step['Compliance Requirement']) &&
      `ctrl: ${clip(step['Control Descriptions'] || step['Control Titles'] || step['Compliance Requirement'], 170)}`,
    step['Exception Handling'] &&
      `exc: ${clip(step['Exception Handling'], 140)}`,
    step.Documents && `docs: ${clip(step.Documents, 80)}`,
  ];
  return parts.filter(Boolean).join(' | ');
}

function buildDigest(
  named: SopNamedBundle[],
  refs: { ref: string; name: string }[],
): string {
  return named
    .map((item, index) => {
      const overview = item.bundle.overview ?? {};
      const policies = [
        ...new Set(item.bundle.policies.flat().map((policy) => policy.name)),
      ];
      return [
        `PROCESS ${refs[index].ref} — ${refs[index].name}`,
        text(overview.trigger) && `Starts when: ${text(overview.trigger)}`,
        text(overview.outcome) && `Ends with: ${text(overview.outcome)}`,
        policies.length ? `Linked policies: ${policies.join('; ')}` : '',
        ...item.bundle.process.map(stepLine),
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');
}

/** Facts the system can check without a model: gaps and oddities in the source data. */
function dataHints(named: SopNamedBundle[], refs: { ref: string }[]): string[] {
  const hints: string[] = [];
  const noExceptions: string[] = [];
  named.forEach((item, index) => {
    const steps = item.bundle.process;
    if (
      steps.length &&
      steps.every((step) => !step['Exception Handling']?.trim())
    )
      noExceptions.push(refs[index].ref);
    const seen = new Map<string, number>();
    for (const step of steps) {
      const key = step.Name.trim().toLowerCase();
      if (key && seen.has(key)) {
        hints.push(
          `${refs[index].ref}: steps ${seen.get(key)} and ${step.SLN} share the title "${step.Name}".`,
        );
      }
      seen.set(key, step.SLN);
    }
    const tails = steps.map((step) => Number(step.Code.split('-').pop()));
    if (tails.every((n) => Number.isFinite(n))) {
      const missing: number[] = [];
      for (let n = Math.min(...tails); n <= Math.max(...tails); n += 1)
        if (!tails.includes(n)) missing.push(n);
      if (missing.length && missing.length <= 3) {
        hints.push(
          `${refs[index].ref}: step codes skip ${missing.join(', ')}; confirm whether steps are missing.`,
        );
      }
    }
  });
  if (noExceptions.length)
    hints.push(
      `No exception handling is recorded for: ${noExceptions.join(', ')}.`,
    );
  return hints.length ? hints : ['None.'];
}

/**
 * Phase 2: one consolidated SOP for everything in the document.
 * Step tables are written per process, then the shared parts (roles, rules, controls,
 * exceptions, records, definitions, open items) are written once across all processes.
 */
export async function runSopPipeline(
  client: Anthropic,
  named: SopNamedBundle[],
  onProgress?: (update: PipelineProgress) => void,
): Promise<{ bundles: PipelineBundle[]; master: SopMaster }> {
  const report = (label: string, percent: number) =>
    onProgress?.({ stage: 'sop', label, percent });
  const refs = uniqueRefs(named);

  // 1. Step tables, in chunks of steps across all processes.
  type Chunk = { bundleIndex: number; steps: ProcessStep[] };
  const chunks: Chunk[] = [];
  named.forEach((item, bundleIndex) => {
    for (let i = 0; i < item.bundle.process.length; i += 10) {
      chunks.push({ bundleIndex, steps: item.bundle.process.slice(i, i + 10) });
    }
  });
  report('Writing the procedure tables', 4);
  const chunkRows = await mapInBatches(
    chunks,
    6,
    (chunk) =>
      callJson(
        client,
        fill(P_SOP_ROWS, {
          process_name: `${refs[chunk.bundleIndex].ref} ${refs[chunk.bundleIndex].name}`,
          steps_json: chunk.steps.map((step) => ({
            SLN: step.SLN,
            Name: step.Name,
            Description: clip(step.Description, 400),
            Responsible: step.Responsible,
            Accountable: step.Accountable,
            'Business Role': step['Business Role'],
            'Verification (VI)': step['Verification (VI)'],
            'Signatory (SI)': step['Signatory (SI)'],
            Support: step.Support,
            TAT: step.TAT,
            'Wait/Delay Time': step['Wait/Delay Time'],
            Documents: step.Documents,
            'Control Descriptions': clip(
              step['Control Descriptions'] || step['Control Titles'],
              300,
            ),
            'Compliance Requirement': clip(step['Compliance Requirement'], 200),
            'Exception Handling': clip(step['Exception Handling'], 200),
          })),
        }),
        Math.min(6000, 600 + chunk.steps.length * 330),
      ),
    (completed, total) =>
      report(
        `Writing the procedure tables (${completed} of ${total})`,
        4 + Math.round((completed / total) * 60),
      ),
  );

  const rowsByBundle: Record<string, unknown>[][] = named.map((item) =>
    item.bundle.process.map((step) => ({
      n: step.SLN,
      // Deterministic fallback, replaced by the written row when the model returned one.
      step: step.Name,
      by: step.Responsible || step['Business Role'],
      verified_by:
        step.Accountable || step['Verification (VI)'] || step['Signatory (SI)'],
      tat: step.TAT,
      key_actions: clip(step.Description, 200),
    })),
  );
  chunks.forEach((chunk, i) => {
    for (const row of listOf(chunkRows[i].rows)) {
      const target = rowsByBundle[chunk.bundleIndex].find(
        (entry) => entry.n === Number(row.n),
      );
      if (!target) continue;
      for (const key of ['step', 'by', 'verified_by', 'tat', 'key_actions']) {
        const value = text(row[key]);
        // An empty value from the model is a real answer for the people columns, never a reason to keep a guess.
        if (value || key !== 'step') target[key] = value;
      }
      // The performer is accountable for their own step: that is not a second pair of eyes.
      if (
        text(target.verified_by) &&
        roleKey(text(target.verified_by)) === roleKey(text(target.by))
      )
        target.verified_by = '';
    }
  });

  // 2. Shared parts, written once across every process.
  report('Consolidating roles, rules and controls', 68);
  const digest = buildDigest(named, refs);
  const hints = dataHints(named, refs).join('\n');
  const [front, roles, defs, rules, open] = await Promise.all([
    callJson(client, fill(P_MASTER_FRONT, { digest }), 3000),
    callJson(client, fill(P_MASTER_ROLES, { digest }), 7000),
    callJson(client, fill(P_MASTER_DEFS, { digest }), 7000),
    callJson(client, fill(P_MASTER_RULES, { digest }), 10000),
    callJson(client, fill(P_MASTER_OPEN, { digest, hints }), 4000),
  ]);
  report('Checking references', 94);

  const known = new Map<string, Set<number>>();
  named.forEach((item, index) =>
    known.set(
      refs[index].ref,
      new Set(item.bundle.process.map((step) => step.SLN)),
    ),
  );
  const refList = (value: unknown): string[] => {
    const raw = Array.isArray(value) ? value.map((v) => text(v)) : [];
    if (raw.some((v) => /^all$/i.test(v))) return ['All'];
    return raw.filter((v) => known.has(v));
  };

  const master: SopMaster = {
    refs: refs.map((entry) => entry.ref),
    front: {
      title: text(front.title),
      purpose: text(front.purpose),
      inScope: text(front.in_scope),
      outOfScope: text(front.out_of_scope),
      prerequisites: text(front.prerequisites),
      primaryPolicy: text(front.primary_policy),
      areas: Object.fromEntries(
        listOf(front.areas)
          .filter((entry) => known.has(text(entry.process)) && text(entry.area))
          .map((entry) => [text(entry.process), text(entry.area)]),
      ),
    },
    roles: listOf(roles.roles)
      .filter((entry) => text(entry.role))
      .map((entry) => ({
        role: text(entry.role),
        names: (Array.isArray(entry.names) ? entry.names : [])
          .map((v) => text(v))
          .filter(Boolean),
        responsibilities: text(entry.responsibilities),
        processes: refList(entry.processes),
      })),
    definitions: listOf(defs.definitions)
      .filter((entry) => text(entry.term) && text(entry.meaning))
      .map((entry) => ({
        term: text(entry.term),
        meaning: scrub(text(entry.meaning)),
      })),
    systems: listOf(defs.systems)
      .filter((entry) => text(entry.system))
      .map((entry) => ({
        system: text(entry.system),
        usedFor: text(entry.used_for),
      })),
    rules: listOf(rules.rules)
      .filter((entry) => text(entry.text))
      .map((entry) => ({
        lead: text(entry.lead),
        text: scrub(text(entry.text)),
      })),
    controls: listOf(rules.controls)
      .filter((entry) => text(entry.control))
      .map((entry) => ({
        control: text(entry.control),
        applied: listOf(entry.applied)
          .filter((a) => known.has(text(a.process)))
          .map((a) => ({
            process: text(a.process),
            steps: (Array.isArray(a.steps) ? a.steps : [])
              .map((n) => Number(n))
              .filter((n) => known.get(text(a.process)).has(n)),
          }))
          .filter((a) => a.steps.length),
        appliesToAll: text(entry.applies_to_all),
        evidence: text(entry.evidence),
      }))
      .filter((entry) => entry.applied.length || entry.appliesToAll),
    exceptions: listOf(rules.exceptions)
      .filter((entry) => text(entry.situation))
      .map((entry) => ({
        situation: text(entry.situation),
        action: text(entry.action),
        escalateTo: text(entry.escalate_to),
      })),
    records: listOf(rules.records)
      .filter((entry) => text(entry.record))
      .map((entry) => ({
        record: text(entry.record),
        heldIn: text(entry.held_in),
      })),
    openItems: (Array.isArray(open.open_items) ? open.open_items : [])
      .map((v) => text(v))
      .filter(Boolean),
  };
  report('The SOP content is ready', 98);

  const bundles = named.map((item, index) => ({
    ...item.bundle,
    sopSteps: rowsByBundle[index],
  }));
  return { bundles, master };
}

/** Phase 3: condense the process into a one-to-two page quick reference. */
export async function runSummaryPipeline(
  client: Anthropic,
  bundle: PipelineBundle,
  onProgress?: (update: PipelineProgress) => void,
  /** One page of a pack that covers many processes: keep it to a single page. */
  compact = false,
): Promise<PipelineBundle> {
  onProgress?.({
    stage: 'summary',
    label: 'Condensing the process into a quick reference',
    percent: 20,
  });
  const summary = await callJson(
    client,
    fill(P_SUMMARY, {
      process_json: bundle.process,
      overview_json: bundle.overview,
      stats_json: bundle.stats,
      limits: compact
        ? 'This summary is one page of a pack that covers many processes: maximum 8 key steps, 4 roles, 3 key controls, 3 records and 3 watch-outs.'
        : 'Maximum 12 key steps, 6 roles, 5 key controls.',
    }),
    4000,
  );
  onProgress?.({
    stage: 'summary',
    label: 'Quick reference written',
    percent: 95,
  });
  return { ...bundle, summary };
}

/* ------------------------------------------------------------------ */
/* Roles: shared by the SOP matrix and the job descriptions            */
/* ------------------------------------------------------------------ */

const NO_ROLE =
  /^(?:na|n\/a|nil|none|null|tbc|tbd|not applicable|not defined|-+|—)$/i;

/** Folds spelling, case, spaces and punctuation so "Sales In-Charge" and "sales in charge" match. */
export const roleKey = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]/g, '');

/** The role names written in one BPM cell. Cells such as "AP Accountant / AP Manager" hold several. */
export function roleNames(value: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  // "N/A" holds a slash but is one value, not two roles.
  for (const part of value.replace(/\bN\s*\/\s*A\b/gi, 'NA').split(/[/;,\n]/)) {
    const name = part.replace(/^["'\s]+|["'\s]+$/g, '').replace(/\s+/g, ' ');
    if (!name || NO_ROLE.test(name) || seen.has(roleKey(name))) continue;
    seen.add(roleKey(name));
    out.push(name);
  }
  return out;
}

/**
 * Who does a step and who checks it. A role that performs a step is not also counted as its
 * verifier: being accountable for your own work is not a second check.
 */
export function stepRoleLinks(step: ProcessStep): {
  performs: string[];
  verifies: string[];
  involved: string[];
} {
  const performs = roleNames(step.Responsible || step['Business Role']);
  const own = new Set(performs.map(roleKey));
  const verifies = roleNames(
    [step.Accountable, step['Verification (VI)'], step['Signatory (SI)']].join(
      '/',
    ),
  ).filter((name) => !own.has(roleKey(name)));
  const involved = roleNames(`${step.Consulted}/${step.Informed}`);
  return { performs, verifies, involved };
}

/* ------------------------------------------------------------------ */
/* Job descriptions                                                    */
/* ------------------------------------------------------------------ */

const JD_STYLE = `Style: formal job-description language, present tense, imperative bullets ("Verify…", "Prepare…"). Use only roles, systems, controls and times named in the data. Never invent qualifications, grades, salaries, headcount, limits or reporting lines. Never write "Not defined", "N/A" or similar placeholders: leave the field empty instead.`;

const P_JD_ROLES = `TASK: Turn the role names found in this BPM data into the list of job-description roles.

FUNCTION: {function_name}
ROLE NAMES IN THE DATA (with how many steps each performs and verifies, and in which processes):
{census}

WHO VERIFIES WHOM (performer → verifier, number of steps):
{verifiers}

OTHER NAMES IN THE DATA (consulted, informed or signing):
{others}

${JD_STYLE}

Rules:
- Merge only spelling, case, typo and abbreviation variants of ONE position (for example "Sales in charge" and "Sales In-Charge"). Never merge different positions, such as a manager and an accountant.
- A name that joins two positions (for example "Sales Person & BS-IT") is listed in "covers" of both roles.
- "covers" holds the role names exactly as written above.
- scope "function": a position inside the {function_name} team, from the head of the function down. scope "outside": executive management above the function (such as a managing director or chief executive), roles of other departments (for example purchasing, legal, compliance, HR, IT, sales, warehouse), outside parties (customers, suppliers, banks, authorities, cardholders), systems or tools, and anything that is not a position. When unsure whether a position belongs to the team, use "function"; when it is clearly not a position, use "outside".
- "reports_to": the position that verifies this role's work according to WHO VERIFIES WHOM. Prefer the most frequent verifier that is a position inside this team; name an executive outside the team only for the head of the function. It must be a position named in the data. Leave it empty when the data does not show one. Never invent a position.
- Every role name listed above must appear in the "covers" of at least one role, so that each one is classified. Order the roles of the function from the most senior to the most junior, then the outside roles. Maximum 70 roles.

SCHEMA:
{"roles":[{"name":"clean role title","covers":["role names as written above"],"scope":"function","level":"Management | Supervisory | Officer | Support team","reports_to":""}]}`;

const P_JD_ROLE = `TASK: Write the job description of ONE role from the BPM steps it takes part in.

FUNCTION: {function_name}
ROLE: {role_name}
{also_known_as}
STEPS (P = the role performs the step, V = the role verifies or approves it):
{dossier}

${JD_STYLE}

Rules:
- Group the responsibilities by process (use the process ref exactly as given). Within a process, merge similar steps into one bullet that says what the role does and why it matters. Maximum 5 bullets per process and 40 in total.
- Every step above must be covered by at least one bullet; list the SLN numbers it covers in "steps". Do not mix P and V steps in one bullet.
- A bullet is one sentence of at most 30 words. Mention the system, document or control when the step data names it. Do not write step codes in the sentence.
- "purpose": 1-2 sentences, at most 45 words: why the role exists and what it protects.
- "systems": the distinct systems or tools used, cleaned (fix spacing and typos, drop quotes), maximum 8.
- "standards": at most 5 measurable standards taken from the turnaround times, controls, KPIs or compliance requirements in the steps, at most 25 words each.
- "authority": one sentence on what the role signs off or approves, only if the steps show it; otherwise empty.

SCHEMA:
{"purpose":"","responsibilities":[{"process":"ref","items":[{"text":"","steps":[1]}]}],"systems":[""],"standards":[""],"authority":""}`;

export type JdItem = {
  text: string;
  steps: number[];
  kind: 'performs' | 'verifies';
  /** Turnaround times of the steps in this item, from the data. */
  tat: string;
};

export type JdRole = {
  name: string;
  level: string;
  /** Role names in the BPM data that this job description stands for. */
  covers: string[];
  reportsTo: string;
  directReports: string[];
  purpose: string;
  authority: string;
  performs: number;
  verifies: number;
  /** Refs of the processes the role takes part in. */
  processes: string[];
  responsibilities: { process: string; items: JdItem[] }[];
  systems: string[];
  worksWith: string[];
  standards: string[];
  controls: string[];
};

export type JdMaster = {
  refs: string[];
  /** Process name per ref, for headings. */
  processNames: Record<string, string>;
  roles: JdRole[];
  /** Roles in the data that belong to another department or an outside party: no job description. */
  outside: {
    name: string;
    performs: number;
    verifies: number;
    processes: string[];
  }[];
  totalSteps: number;
};

type RoleUse = {
  name: string;
  spellings: Map<string, number>;
  performs: Set<string>;
  verifies: Set<string>;
};

/** `ref:sln` identifies one step of the document. */
const stepId = (ref: string, sln: number) => `${ref}:${sln}`;

function splitId(id: string): { ref: string; sln: number } {
  const cut = id.lastIndexOf(':');
  return { ref: id.slice(0, cut), sln: Number(id.slice(cut + 1)) };
}

function jdStepLine(step: ProcessStep, mode: 'P' | 'V', ref: string): string {
  const base = [
    `${ref} s${step.SLN}`,
    `[${mode}]`,
    clip(step.Name, 80),
    mode === 'P' && step.Description && clip(step.Description, 150),
    mode === 'V' &&
      step.Responsible &&
      `done by: ${clip(step.Responsible, 40)}`,
    step.TAT && `TAT: ${clip(step.TAT, 25)}`,
    step.Support && `sys: ${clip(step.Support.replace(/\s*\n\s*/g, ', '), 60)}`,
    (step['Control Titles'] || step['Control Descriptions']) &&
      `ctrl: ${clip(step['Control Titles'] || step['Control Descriptions'], mode === 'P' ? 110 : 70)}`,
    mode === 'P' &&
      step['Exception Handling'] &&
      `exc: ${clip(step['Exception Handling'], 80)}`,
    mode === 'P' && step.Documents && `docs: ${clip(step.Documents, 60)}`,
    mode === 'P' && step.KPI && `kpi: ${clip(step.KPI, 60)}`,
  ];
  return base.filter(Boolean).join(' | ');
}

const uniqueText = (values: string[]) => {
  const seen = new Set<string>();
  return values.filter((v) => {
    const key = roleKey(v);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/**
 * Phase 4: one job description per role, written from the steps the role performs or verifies.
 * Counts, process lists, reporting lines and "works with" come from the data; the model only
 * writes the wording and groups the steps.
 */
export async function runJdPipeline(
  client: Anthropic,
  named: SopNamedBundle[],
  functionName: string,
  onProgress?: (update: PipelineProgress) => void,
): Promise<JdMaster> {
  const report = (label: string, percent: number) =>
    onProgress?.({ stage: 'jd', label, percent });
  const refs = uniqueRefs(named);
  const refList = refs.map((entry) => entry.ref);
  const stepsOf = new Map<string, ProcessStep>();
  named.forEach((item, index) =>
    item.bundle.process.forEach((step) =>
      stepsOf.set(stepId(refList[index], step.SLN), step),
    ),
  );

  report('Finding the roles in the process data', 4);
  // 1. Census of every role name, by folded spelling.
  const census = new Map<string, RoleUse>();
  const otherNames = new Map<string, string>();
  const verifierPairs = new Map<string, number>();
  const touch = (name: string): RoleUse => {
    const key = roleKey(name);
    let use = census.get(key);
    if (!use) {
      use = {
        name,
        spellings: new Map(),
        performs: new Set(),
        verifies: new Set(),
      };
      census.set(key, use);
    }
    use.spellings.set(name, (use.spellings.get(name) ?? 0) + 1);
    return use;
  };
  for (const [id, step] of stepsOf) {
    const links = stepRoleLinks(step);
    for (const name of links.performs) touch(name).performs.add(id);
    for (const name of links.verifies) touch(name).verifies.add(id);
    for (const name of links.involved)
      if (!otherNames.has(roleKey(name))) otherNames.set(roleKey(name), name);
    for (const performer of links.performs)
      for (const verifier of links.verifies) {
        const pair = `${roleKey(performer)}>${roleKey(verifier)}`;
        verifierPairs.set(pair, (verifierPairs.get(pair) ?? 0) + 1);
      }
  }
  for (const use of census.values()) {
    // The most common spelling is the display name.
    use.name = [...use.spellings.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }
  if (!census.size)
    throw new Error(
      'The BPM data names no roles, so no job descriptions can be written.',
    );

  const processesOf = (ids: Set<string>) =>
    refList.filter((ref) => [...ids].some((id) => splitId(id).ref === ref));
  const censusText = [...census.values()]
    .sort(
      (a, b) =>
        b.performs.size + b.verifies.size - (a.performs.size + a.verifies.size),
    )
    .map((use) => {
      const sample = [...use.performs]
        .slice(0, 3)
        .map((id) => clip(stepsOf.get(id).Name, 40))
        .join('; ');
      const variants = [...use.spellings.keys()].filter((v) => v !== use.name);
      return `- "${use.name}"${variants.length ? ` (also written: ${variants.map((v) => `"${v}"`).join(', ')})` : ''} — performs ${use.performs.size}, verifies ${use.verifies.size} — processes: ${compactRefList(processesOf(new Set([...use.performs, ...use.verifies])))}${sample ? ` — e.g. ${sample}` : ''}`;
    })
    .join('\n');
  const display = (key: string) =>
    census.get(key)?.name ?? otherNames.get(key) ?? key;
  const verifierText =
    [...verifierPairs.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 60)
      .map(([pair, count]) => {
        const [from, to] = pair.split('>');
        return `"${display(from)}" → "${display(to)}" (${count})`;
      })
      .join('\n') || 'None recorded.';
  const othersText =
    [...otherNames.values()]
      .filter((name) => !census.has(roleKey(name)))
      .join('; ') || 'None.';

  // 2. Which names are one role, who is inside the function, who reports to whom.
  report('Grouping the roles and their reporting lines', 10);
  const rolePlan = await callJson(
    client,
    fill(P_JD_ROLES, {
      function_name: functionName,
      census: censusText,
      verifiers: verifierText,
      others: othersText,
    }),
    Math.min(12000, 1500 + census.size * 170),
  );

  type PlanRole = {
    name: string;
    keys: string[];
    scope: 'function' | 'outside';
    level: string;
    reportsTo: string;
  };
  const plan: PlanRole[] = [];
  const claimed = new Set<string>();
  for (const entry of listOf(rolePlan.roles)) {
    const name = text(entry.name);
    if (!name) continue;
    const keys = (Array.isArray(entry.covers) ? entry.covers : [])
      .map((v) => roleKey(text(v)))
      .filter((key) => census.has(key));
    if (!keys.length && census.has(roleKey(name))) keys.push(roleKey(name));
    if (!keys.length) continue;
    const existing = plan.find((r) => roleKey(r.name) === roleKey(name));
    if (existing) {
      existing.keys = [...new Set([...existing.keys, ...keys])];
    } else {
      plan.push({
        name,
        keys: [...new Set(keys)],
        scope: text(entry.scope) === 'outside' ? 'outside' : 'function',
        level: text(entry.level),
        reportsTo: text(entry.reports_to),
      });
    }
    keys.forEach((key) => claimed.add(key));
  }
  // A role name the model skipped: a name with real work in the data still gets its own job
  // description; a name that barely appears is listed as outside the function.
  for (const [key, use] of census) {
    if (!claimed.has(key))
      plan.push({
        name: use.name,
        keys: [key],
        scope:
          use.performs.size + use.verifies.size >= 3 ? 'function' : 'outside',
        level: '',
        reportsTo: '',
      });
  }

  const insidePlan = plan.filter((role) => role.scope === 'function');
  const knownNames = new Map<string, string>();
  insidePlan.forEach((role) => knownNames.set(roleKey(role.name), role.name));
  census.forEach((use, key) => {
    if (!knownNames.has(key)) knownNames.set(key, use.name);
  });
  otherNames.forEach((name, key) => {
    if (!knownNames.has(key)) knownNames.set(key, name);
  });

  const keyToRole = new Map<string, string>();
  insidePlan.forEach((role) =>
    role.keys.forEach((key) => {
      if (!keyToRole.has(key)) keyToRole.set(key, role.name);
    }),
  );

  const outside = plan
    .filter((role) => role.scope === 'outside')
    .map((role) => {
      const performs = new Set<string>();
      const verifies = new Set<string>();
      role.keys.forEach((key) => {
        census.get(key).performs.forEach((id) => performs.add(id));
        census.get(key).verifies.forEach((id) => verifies.add(id));
      });
      return {
        name: role.name,
        performs: performs.size,
        verifies: [...verifies].filter((id) => !performs.has(id)).length,
        processes: processesOf(new Set([...performs, ...verifies])),
      };
    });

  // 3. One job description per role inside the function.
  const done: JdRole[] = [];
  const written = await mapInBatches(
    insidePlan,
    4,
    async (role) => {
      const performs = new Set<string>();
      const verifiesAll = new Set<string>();
      role.keys.forEach((key) => {
        census.get(key).performs.forEach((id) => performs.add(id));
        census.get(key).verifies.forEach((id) => verifiesAll.add(id));
      });
      const verifies = new Set(
        [...verifiesAll].filter((id) => !performs.has(id)),
      );
      const byOrder = (a: string, b: string) => {
        const x = splitId(a);
        const y = splitId(b);
        return refList.indexOf(x.ref) - refList.indexOf(y.ref) || x.sln - y.sln;
      };
      const orderedPerforms = [...performs].sort(byOrder);
      const orderedVerifies = [...verifies].sort(byOrder);
      const dossier = [
        ...orderedPerforms.map((id) =>
          jdStepLine(stepsOf.get(id), 'P', splitId(id).ref),
        ),
        ...orderedVerifies.map((id) =>
          jdStepLine(stepsOf.get(id), 'V', splitId(id).ref),
        ),
      ].join('\n');
      const variants = role.keys
        .map((key) => census.get(key).name)
        .filter((name) => roleKey(name) !== roleKey(role.name));
      const result = await callJson(
        client,
        fill(P_JD_ROLE, {
          function_name: functionName,
          role_name: role.name,
          also_known_as: variants.length
            ? `ALSO WRITTEN IN THE DATA AS: ${variants.join('; ')}`
            : '',
          dossier,
        }),
        Math.min(10000, 2000 + (performs.size + verifies.size) * 55),
      );
      return { role, performs, verifies, result };
    },
    (completed, total) =>
      report(
        `Writing job descriptions (${completed} of ${total})`,
        14 + Math.round((completed / Math.max(total, 1)) * 78),
      ),
  );

  report('Checking the job descriptions against the steps', 94);
  for (const { role, performs, verifies, result } of written) {
    const mine = new Set([...performs, ...verifies]);
    const covered = new Set<string>();
    const groups = new Map<string, JdItem[]>();
    const addItem = (ref: string, item: JdItem) => {
      const list = groups.get(ref) ?? [];
      list.push(item);
      groups.set(ref, list);
    };
    const tatOf = (ids: string[]) => {
      const values = uniqueText(
        ids
          .map((id) => stepsOf.get(id)?.TAT?.trim() ?? '')
          .filter((v) => v && !NO_ROLE.test(v)),
      );
      return values.length && values.length <= 2 ? values.join(' / ') : '';
    };
    for (const block of listOf(result.responsibilities)) {
      const ref = text(block.process);
      if (!refList.includes(ref)) continue;
      for (const item of listOf(block.items)) {
        const sentence = scrub(text(item.text));
        const ids = (Array.isArray(item.steps) ? item.steps : [])
          .map((n) => stepId(ref, Number(n)))
          .filter((id) => mine.has(id));
        if (!sentence || !ids.length) continue;
        ids.forEach((id) => covered.add(id));
        const everyVerified = ids.every((id) => verifies.has(id));
        addItem(ref, {
          text: sentence,
          steps: ids.map((id) => splitId(id).sln),
          kind: everyVerified ? 'verifies' : 'performs',
          tat: tatOf(ids),
        });
      }
    }
    // Any step the model left out is still listed, so no duty is ever missing from a job description.
    for (const kind of ['performs', 'verifies'] as const) {
      const missing = [...(kind === 'performs' ? performs : verifies)].filter(
        (id) => !covered.has(id),
      );
      const byRef = new Map<string, string[]>();
      missing.forEach((id) => {
        const { ref } = splitId(id);
        byRef.set(ref, [...(byRef.get(ref) ?? []), id]);
      });
      for (const [ref, ids] of byRef) {
        addItem(ref, {
          text: `${kind === 'performs' ? 'Also carry out' : 'Also verify'}: ${ids
            .map((id) => clip(stepsOf.get(id).Name, 60))
            .join('; ')}.`,
          steps: ids.map((id) => splitId(id).sln),
          kind,
          tat: tatOf(ids),
        });
      }
    }
    const ownKeys = new Set(role.keys);
    const together = new Map<string, number>();
    const controls: string[] = [];
    const systemsSeen: string[] = [];
    for (const id of mine) {
      const step = stepsOf.get(id);
      const links = stepRoleLinks(step);
      for (const name of [
        ...links.performs,
        ...links.verifies,
        ...links.involved,
      ]) {
        const key = roleKey(name);
        if (ownKeys.has(key)) continue;
        const label = keyToRole.get(key) ?? knownNames.get(key) ?? name;
        together.set(label, (together.get(label) ?? 0) + 1);
      }
      controls.push(
        ...step['Control IDs']
          .split(/[,;\s]+/)
          .map((c) => c.trim())
          .filter(Boolean),
      );
      systemsSeen.push(
        ...step.Support.split(/[\n,]/)
          .map((v) => v.replace(/["']/g, '').replace(/\s+/g, ' ').trim())
          .filter((v) => v && !NO_ROLE.test(v)),
      );
    }
    const systems = uniqueText(
      (Array.isArray(result.systems) ? result.systems : [])
        .map((v) => text(v))
        .filter(Boolean),
    );
    done.push({
      name: role.name,
      level: role.level,
      covers: role.keys.map((key) => census.get(key).name),
      reportsTo: '',
      directReports: [],
      purpose: scrub(text(result.purpose)),
      authority: scrub(text(result.authority)),
      performs: performs.size,
      verifies: verifies.size,
      processes: processesOf(mine),
      responsibilities: refList
        .filter((ref) => groups.has(ref))
        .map((ref) => ({ process: ref, items: groups.get(ref) })),
      systems: (systems.length ? systems : uniqueText(systemsSeen)).slice(0, 8),
      worksWith: [...together.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([name]) => name),
      standards: uniqueText(
        (Array.isArray(result.standards) ? result.standards : [])
          .map((v) => scrub(text(v)))
          .filter(Boolean),
      ).slice(0, 5),
      controls: uniqueText(controls).slice(0, 12),
    });
  }

  // Reporting lines: only to a role named in the data, never to itself, never in a loop.
  const roleByKey = new Map(done.map((role) => [roleKey(role.name), role]));
  const parentOf = new Map<string, string>();
  for (const role of insidePlan) {
    let raw = role.reportsTo;
    // Only the head of the function reports outside the team. Anyone else reports to the
    // position inside the team that verifies their work most often.
    if (!raw || !roleByKey.has(roleKey(raw))) {
      const tally = new Map<string, number>();
      for (const own of role.keys)
        for (const [pair, count] of verifierPairs) {
          const [from, to] = pair.split('>');
          const manager = keyToRole.get(to);
          if (
            from === own &&
            manager &&
            roleKey(manager) !== roleKey(role.name)
          )
            tally.set(manager, (tally.get(manager) ?? 0) + count);
        }
      const best = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
      if (best) raw = best[0];
    }
    if (!raw) continue;
    const key = roleKey(raw);
    if (key === roleKey(role.name) || !knownNames.has(key)) continue;
    const target =
      roleByKey.get(key)?.name ?? keyToRole.get(key) ?? knownNames.get(key);
    // Walk up from the proposed manager: reaching this role would close a loop.
    let cursor: string | undefined = target;
    let loops = false;
    for (let hops = 0; cursor && hops < 40; hops += 1) {
      if (roleKey(cursor) === roleKey(role.name)) loops = true;
      cursor = parentOf.get(roleKey(cursor));
    }
    if (!loops) parentOf.set(roleKey(role.name), target);
  }
  for (const role of done) {
    role.reportsTo = parentOf.get(roleKey(role.name)) ?? '';
    role.directReports = done
      .filter((other) => parentOf.get(roleKey(other.name)) === role.name)
      .map((other) => other.name);
  }

  return {
    refs: refList,
    processNames: Object.fromEntries(refs.map((e) => [e.ref, e.name])),
    roles: done,
    outside,
    totalSteps: stepsOf.size,
  };
}

function compactRefList(refs: string[]): string {
  return refs.length > 8
    ? `${refs.slice(0, 4).join(', ')} … ${refs.slice(-1)[0]} (${refs.length} processes)`
    : refs.join(', ');
}

/* ------------------------------------------------------------------ */
/* Summary SOP: the page that opens a whole process function            */
/* ------------------------------------------------------------------ */

const P_SUMMARY_OVERVIEW = `TASK: Write the one-page overview that opens the Summary SOP of a whole process function.

FUNCTION: {function_name}

PROCESSES (ref — name — what each summary says):
{processes}

CONTROLS ACROSS THE FUNCTION:
{controls}

EXCEPTIONS ACROSS THE FUNCTION:
{exceptions}

${SOP_STYLE}

SCHEMA:
{"purpose":"2 sentences, maximum 50 words: what the function achieves end to end",
 "journey":"2-3 sentences, maximum 60 words: how the processes lead into each other; only links the data supports",
 "processes":[{"process":"ref exactly as given","does":"maximum 22 words"}],
 "top_controls":["maximum 5, each under 22 words"],
 "watch_outs":["maximum 5, each under 25 words"],
 "escalation":"maximum 30 words, empty if the data names none"}`;

export type SummaryOverview = {
  refs: string[];
  purpose: string;
  journey: string;
  does: Record<string, string>;
  topControls: string[];
  watchOuts: string[];
  escalation: string;
};

/** Phase 3b: the overview page of a multi-process Summary SOP, built on the finished SOP content. */
export async function runSummaryOverview(
  client: Anthropic,
  named: SopNamedBundle[],
  master: SopMaster | undefined,
  functionName: string,
): Promise<SummaryOverview> {
  const refs = uniqueRefs(named);
  const processes = named
    .map((item, index) => {
      const summary = item.bundle.summary ?? {};
      const steps = Array.isArray(summary.key_steps)
        ? (summary.key_steps as Record<string, unknown>[])
            .map((s) => text(s.step))
            .filter(Boolean)
            .slice(0, 4)
            .join(' → ')
        : '';
      return `${refs[index].ref} — ${refs[index].name} (${item.bundle.process.length} steps): ${text(summary.purpose)}${steps ? ` Key steps: ${steps}` : ''}`;
    })
    .join('\n');
  const result = await callJson(
    client,
    fill(P_SUMMARY_OVERVIEW, {
      function_name: functionName,
      processes,
      controls:
        (master?.controls ?? [])
          .slice(0, 12)
          .map((c) => `- ${c.control}`)
          .join('\n') || 'None recorded.',
      exceptions:
        (master?.exceptions ?? [])
          .slice(0, 10)
          .map((e) => `- ${e.situation}: ${e.action}`)
          .join('\n') || 'None recorded.',
    }),
    4000,
  );
  const known = new Set(refs.map((entry) => entry.ref));
  const list = (value: unknown) =>
    (Array.isArray(value) ? value : [])
      .map((v) => scrub(text(v)))
      .filter(Boolean);
  return {
    refs: refs.map((entry) => entry.ref),
    purpose: scrub(text(result.purpose)),
    journey: scrub(text(result.journey)),
    does: Object.fromEntries(
      listOf(result.processes)
        .filter((entry) => known.has(text(entry.process)) && text(entry.does))
        .map((entry) => [text(entry.process), scrub(text(entry.does))]),
    ),
    topControls: list(result.top_controls).slice(0, 5),
    watchOuts: list(result.watch_outs).slice(0, 5),
    escalation: scrub(text(result.escalation)),
  };
}
