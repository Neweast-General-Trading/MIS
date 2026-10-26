# Architecture

## Overview

```
Browser (React SPA)  ──HTTPS──▶  nginx  ──▶  NestJS API  ──▶  PostgreSQL
                                   │              ├──▶ Oracle Fusion HCM (REST)
                                   │              ├──▶ SAP HANA / SQL Server
                                   │              ├──▶ Anthropic API (AI documents)
                                   │              └──▶ headless Chrome (PDF, Mermaid)
                                   └── static files (material-kit-react/dist)
```

## Domain model

```
Company ─┬─ Process Function (Department) ─── Process ─── Sub-process (Activity)
         │                                       │              ├─ details (JSONB, template driven)
         └─ OrgDepartment (master list)          │              ├─ relations / policy links
                                                 │              └─ comments + attachments
                                                 └─ Activity Template (field definitions)
```

- A **Process** points to an **Activity Template** that defines the fields of its sub-processes.
- Sub-process values are stored as a JSONB `details` object keyed by template field key.
- Field types: `text`, `textarea`, `dropdown`, `dropdown_multiselect`, `numeric_days`, `yes_no`,
  `app_master`, `oracle_job_role_multi`, `approval_flow`, …
- **Approval Flow** is stored as `["Yes", "<role L1>", "<role L2>", …]` or `["No"]`.

## Backend (`bpm-api`)

| Module | Responsibility |
|--------|----------------|
| `auth`, `access-control` | Sign-in (password / Microsoft), JWT, roles, permissions, user scoping |
| `companies`, `departments`, `processes`, `activities` | Core hierarchy, dashboard rollups, import/export |
| `activity-templates`, `applications` | Template field definitions, Application Master |
| `ai-bpm` | AI document generation and Word export pipeline (jobs, progress, downloads) |
| `print` | HTML → PDF printing for sub-processes, processes and process functions |
| `bpm-assistant` | Chat assistant and inquiry log |
| `process-documentation` | File library per process function / process |
| `oracle`, `hana`, `sql` | External data sources (jobs/positions, departments, employees) |
| `maintenance`, `system-health` | Data tools and health checks |
| `common` | Interceptors (audit log, read cache), utilities |

Cross-cutting behaviour:

- **Guards** — `@RequirePermission(...)`, `@RequireSuperAdmin()`, `@RequireAiAccess()`.
- **Interceptors** — user audit log (rotates at 80 MB), in-memory read cache for heavy GET
  endpoints (90 s TTL, cleared on any write), class serializer.
- **Caches** — Oracle jobs/positions are cached for 10 minutes.

## Frontend (`material-kit-react`)

- Vite + React 19 + MUI 7; routes are lazy-loaded (`src/routes/sections.tsx`).
- Product code is in `src/sections/bpm`: `view/` (pages), `components/` (shared UI),
  `api.ts` (typed HTTP client with a short read cache and in-flight de-duplication).
- Permission checks mirror the server (`access-control.ts`); the server is always authoritative.

## Runtime data (git-ignored)

| Path | Content |
|------|---------|
| `bpm-api/docx/BPM-Files/` | Uploaded attachments and process documentation |
| `word-jobs/` | Temporary Word export jobs |
| `User_LOG/` | JSON-lines audit log |
| `backups/` | Database backups |
