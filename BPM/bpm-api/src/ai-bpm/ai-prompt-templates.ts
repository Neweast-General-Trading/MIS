export type AiPromptTemplateId =
  | 'full-bpm-document'
  | 'raci-matrix'
  | 'bpmn-swimlane';

export type AiPromptTemplatePublic = {
  id: AiPromptTemplateId;
  name: string;
  description: string;
  promptSummary: string;
};

export type AiPromptTemplate = AiPromptTemplatePublic & {
  deliverableInstruction: string;
};

export const AI_BPM_JSON_SCHEMA = `{
  "cover": {
    "title": "string — document title",
    "subtitle": "string — optional tagline",
    "processFunction": "string — name",
    "processFunctionCode": "string",
    "processTarget": "string — single process or 'All processes (N)'",
    "companyCode": "string",
    "documentVersion": "1.0",
    "confidentiality": "Internal"
  },
  "sections": [
    {
      "heading": "string — section title with number e.g. 1. Purpose",
      "level": 1,
      "content": [
        { "type": "paragraph", "text": "..." },
        { "type": "bullets", "items": ["..."] },
        { "type": "table", "headers": ["Col1","Col2"], "rows": [["a","b"]] },
        {
          "type": "raciTable",
          "rows": [
            { "stepId": "001", "stepName": "...", "r": "R", "a": "A", "c": "C", "i": "I", "notes": "" }
          ]
        },
        {
          "type": "swimlaneTable",
          "phases": ["Phase 1", "Phase 2"],
          "lanes": [{ "lane": "Role name", "cells": ["task in phase 1", "task in phase 2"] }]
        }
      ]
    }
  ]
}`;

export const AI_BPM_SYSTEM_PROMPT = `You are a senior BPM consultant for Neweast producing board-ready business process documentation.

CRITICAL OUTPUT RULE:
- Your response is pre-filled with "{" — continue from there and end with "}".
- Output ONLY one valid JSON object matching the schema below.
- No markdown, no prose, no code fences, no text before or after the JSON.
- Use ONLY the BPM JSON input. Do not invent sub-processes not in the data.
- Comments/discussion are excluded — never reference them.

Quality standards:
- Professional corporate tone suitable for Microsoft Word export.
- Number sections (1., 2., 3.) and subsections where needed (level 2 or 3).
- Every sub-process in the data must appear in the catalogue and RACI where applicable.
- RACI: one row per sub-process step; use R/A/C/I letters or R/A/C/I combined; "—" or "TBD" when unknown.
- Swimlane: at least one swimlaneTable with realistic phases and lanes derived from owners/roles.
- For process-function scope (multiple processes): add a section per process (level 2) inside the document.
- Mark gaps as "(Assumption)" or "(Data gap)" in paragraph text.

JSON schema:
${AI_BPM_JSON_SCHEMA}`;

export const AI_PROMPT_TEMPLATES: AiPromptTemplate[] = [
  {
    id: 'full-bpm-document',
    name: 'Full BPM document',
    description:
      'Detailed business process document with narrative, scope, and swimlane BPMN flow (Word).',
    promptSummary:
      'Create a detailed business process document with swimlane BPMN flow as a Word document.',
    deliverableInstruction: `Include a full business process document section set:
1. Document control (cover fields are separate — use sections for body)
2. Executive summary with measurable scope (step count, owners, controls posture)
3. Process purpose, trigger, end state, and boundaries
4. Definitions and abbreviations where useful
5. Process overview
6. BPMN swimlane flow (mandatory) plus sequence narrative
7. Sub-process catalogue (Code | Name | Description | Status | Owners)
8. Detailed register: EVERY template column for EVERY sub-process (empty = —), plus analyst notes
9. Inputs, outputs, systems, TAT/FTE from field values (thematic tables)
10. Controls, risks, compliance/policy/KPI analysis and data-gap remediation`,
  },
  {
    id: 'raci-matrix',
    name: 'RACI matrix',
    description: 'RACI matrix (R/A/C/I) per sub-process step.',
    promptSummary:
      'Add responsibilities: RACI Matrix (Responsible / Accountable / Consulted / Informed) per step.',
    deliverableInstruction: `Include a dedicated section with:
- Full RACI covering EVERY sub-process (R/A/C/I plus Support / VI / SI when present in template)
- Detailed governance narrative: SoD risks, unclear ownership, escalation, bottlenecks
- Summary of roles appearing across the process`,
  },
  {
    id: 'bpmn-swimlane',
    name: 'BPMN swimlane flow',
    description: 'BPMN swimlane flow with lanes, phases, gateways.',
    promptSummary: 'Add BPMN swimlane flow.',
    deliverableInstruction: `Include a dedicated section with:
- Swimlane matrix (lanes = roles/departments, columns = phases, cells = activity codes)
- Mermaid end-to-end flow plus sequence narrative in SLN order
- Critical path, approvals, wait/delay, and rework notes from template fields`,
  },
];

export const AI_TEMPLATE_IDS = AI_PROMPT_TEMPLATES.map((t) => t.id);

export function getAiPromptTemplates(ids: string[]): AiPromptTemplate[] {
  const set = new Set(ids);
  return AI_PROMPT_TEMPLATES.filter((t) => set.has(t.id));
}

export function listAiPromptTemplatesPublic(): AiPromptTemplatePublic[] {
  return AI_PROMPT_TEMPLATES.map(
    ({ id, name, description, promptSummary }) => ({
      id,
      name,
      description,
      promptSummary,
    }),
  );
}
