# BPM — Business Process Management Platform

A web platform for documenting, governing and publishing a company's business processes.
It models the full hierarchy **Company → Process Function → Process → Sub-process**, captures
RACI roles, approval flows, risks, policies and exceptions on every sub-process, and produces
print-ready **PDF** and **Word** documentation.

> Internal product of **New East General Trading**. See [LICENSE](LICENSE).

---

## Table of contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Quick start (local development)](#quick-start-local-development)
- [Configuration](#configuration)
- [Production deployment](#production-deployment)
- [Access control](#access-control)
- [Backups](#backups)
- [Useful commands](#useful-commands)
- [Documentation](#documentation)
- [Contributing](#contributing)

---

## Features

**Process modelling**

- Hierarchy of companies, process functions (departments), processes and sub-processes with
  automatic hierarchical codes (e.g. `001-002-003`).
- **Activity templates** — configurable field sets per process, with typed fields: text, dropdown,
  multi-select, numeric (days), yes/no, application master, Oracle job roles, and **Approval Flow**.
- **RACI** (Responsible / Accountable / Consulted / Informed), verifier and signatory roles,
  with job roles sourced from Oracle HCM (jobs **and** positions) — free-text entries are also kept.
- **Approval matrix** — ordered approval levels (Level 1 → Level N), one job role per level.
- Exception description / mitigation, risks, controls, TAT, wait time, frequency, policies and
  linked sub-processes.
- Policy links to an external *Policy Creator* application, comments with attachments and
  per-field discussions.
- Vendor overlay values that never overwrite the original answers.

**Analytics dashboard**

- Per-company rollup: process functions, processes, sub-processes, impacted job roles, policies
  and average TAT.
- **Job Roles Wise** — pick any job role and see every process function it works in, its RACI
  involvement and approver workload; donut views for workload, approvals, reach and function.

**Documents & printing**

- Print any sub-process, a full process, or a whole process function (processes and nested
  sub-processes) as a styled PDF with live links (policies, related sub-processes, URLs).
- **AI-assisted Word export** (`.docx`) for processes and process functions, including SOP,
  summary and job-description variants, with Mermaid-rendered flow diagrams.
- AI document generation from stored prompt templates ("Automation BPM").
- Process documentation file library per process function / process.
- Built-in BPM assistant chat with an inquiry log.

**Platform**

- Role-based access control (roles, permissions, per-user process-function scope, Vendor role).
- Email/password sign-in and optional **Microsoft (Entra ID)** sign-in; JWT sessions.
- Full user activity audit log with automatic rotation.
- Server-side read cache, response compression and client-side request de-duplication.
- Integrations: **Oracle Fusion HCM**, **SAP HANA**, **SQL Server** (master-data comparison).
- Scheduled database backups with e-mail delivery.
- System health-check page.

## Architecture

```
┌──────────────────────┐   HTTPS   ┌───────────┐  API paths     ┌────────────────────┐
│  Browser (React SPA) │ ────────▶ │   nginx   │ ─────────────▶ │  NestJS API (Node) │
│  Vite build (static) │ ◀──────── │ + gzip    │                │  port 3000 / PORT  │
└──────────────────────┘           └───────────┘                └─────────┬──────────┘
                                                                          │ TypeORM
                       ┌────────────────────────┬───────────────┬─────────┴─────────┐
                       ▼                        ▼               ▼                   ▼
                 PostgreSQL 16        Oracle Fusion HCM   SAP HANA / SQL Server   Anthropic API
              (bpm database)          (jobs, positions)   (departments, payroll)   (AI documents)
```

- The SPA is a static build served by nginx; nginx proxies API paths to the NestJS process and
  serves `index.html` only for browser navigations.
- Headless Chrome/Chromium renders PDFs (`--print-to-pdf`) and Mermaid diagrams.
- More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Tech stack

| Layer      | Technology |
|------------|------------|
| Frontend   | React 19, TypeScript, Vite 6, Material UI 7, React Router 7, ApexCharts |
| Backend    | NestJS 11, TypeScript, TypeORM 0.3, class-validator |
| Database   | PostgreSQL 16 |
| Documents  | `docx` (Word), headless Chrome (PDF), Mermaid CLI (diagrams) |
| Auth       | JWT, bcrypt, optional Microsoft Entra ID (OAuth 2) |
| Integrations | Oracle Fusion HCM REST, SAP HANA, Microsoft SQL Server, Anthropic Claude |
| Ops        | systemd / PM2, nginx, Docker (database), cron backups |

The web UI started from the open-source
[Minimal UI – Material Kit React](https://github.com/minimal-ui-kit/material-kit-react) template
(MIT, see [material-kit-react/LICENSE.md](material-kit-react/LICENSE.md)).

## Repository layout

```
.
├── bpm-api/                NestJS REST API
│   ├── src/                Modules: access-control, auth, companies, departments, processes,
│   │                       activities, activity-templates, ai-bpm, print, oracle, hana, sql, …
│   ├── docx/logo/          Branding assets used by generated documents
│   ├── tools/mermaid/      Mermaid CLI used to render diagrams for Word exports
│   ├── docker-compose.yml  PostgreSQL for local development
│   └── .env.example        All supported environment variables
├── material-kit-react/     React single-page application (web UI)
│   ├── src/sections/bpm/   Product code (views, components, API client)
│   └── .env.example
├── deploy/                 nginx and systemd templates
├── scripts/                Database backup + e-mail scripts and cron helpers
├── docs/                   Architecture, deployment and security notes
├── ecosystem.config.cjs    Optional PM2 definition for the web dev server
└── package.json            Root convenience scripts
```

## Quick start (local development)

### Prerequisites

- **Node.js ≥ 20** and npm ≥ 10
- **Docker** (for PostgreSQL) — or any PostgreSQL 14+ instance
- *Optional:* Google Chrome / Chromium (PDF printing and Mermaid diagrams)

### 1. Clone and install

```bash
git clone https://github.com/Neweast-General-Trading/BPM.git
cd BPM
npm run install:all
```

### 2. Start PostgreSQL

```bash
cd bpm-api
docker compose up -d        # PostgreSQL 16 on 127.0.0.1:55432, database "bpm"
```

### 3. Configure the API

```bash
cd bpm-api
cp .env.example .env
```

Edit `.env` for local use:

```dotenv
DB_HOST=localhost
DB_PORT=55432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=bpm
JWT_SECRET=any-long-random-string
ADMINISTRATOR_EMAIL=admin@example.com
ADMIN_INITIAL_PASSWORD=ChangeMe-123
```

The schema is created automatically on first start (TypeORM `synchronize`), and the
administrator account is seeded from `ADMINISTRATOR_EMAIL` / `ADMIN_INITIAL_PASSWORD`.
Oracle, SAP HANA, SQL Server, Microsoft and AI settings are optional; the related features stay
disabled until they are configured.

### 4. Run the API and the web UI

```bash
# terminal 1 — API on http://localhost:3000
npm run dev:api

# terminal 2 — web UI on http://localhost:5173
cp material-kit-react/.env.example material-kit-react/.env   # VITE_API_BASE_URL=http://localhost:3000
npm run dev:web
```

Open <http://localhost:5173> and sign in with the administrator account.

## Configuration

All backend settings are environment variables documented in
[`bpm-api/.env.example`](bpm-api/.env.example). The most important ones:

| Variable | Purpose |
|----------|---------|
| `DB_*` | PostgreSQL connection |
| `JWT_SECRET`, `REQUIRE_JWT_AUTH` | Session signing and enforcement (**required in production**) |
| `ADMINISTRATOR_EMAIL`, `ADMIN_INITIAL_PASSWORD` | Protected Super Admin account |
| `AI_EXPORT_ALLOWED_EMAILS` | Extra users allowed to use AI Word export (besides Super Admin) |
| `FRONTEND_ORIGIN`, `PUBLIC_APP_URL` | CORS origins and public URL for generated documents |
| `ORACLE_HCM_*` | Job roles / positions / legal entities from Oracle Fusion HCM |
| `SAP_HANA_*`, `SERVER_NODE` | Department lists from SAP HANA |
| `SQL_DB_*` | Employee master-data comparison |
| `ANTHROPIC_*` | AI document generation and the BPM assistant |
| `AZURE_*`, `CLIENT_URL` | Microsoft sign-in |

The web UI reads one build-time variable, `VITE_API_BASE_URL` (see
[`material-kit-react/.env.example`](material-kit-react/.env.example)).

## Production deployment

A condensed outline — the full runbook is in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

```bash
# 1. Database
cd bpm-api && docker compose up -d

# 2. API
cp .env.example .env            # set NODE_ENV=production, JWT_SECRET, REQUIRE_JWT_AUTH=true, PORT=3010, …
npm ci && npm run build
sudo cp ../deploy/bpm-api.service.example /etc/systemd/system/bpm-api.service   # adjust paths
sudo systemctl enable --now bpm-api

# 3. Web UI
cd ../material-kit-react
npm ci && npm run build         # static files in dist/

# 4. nginx
sudo cp ../deploy/nginx.conf.example /etc/nginx/sites-available/bpm   # set server_name + TLS
sudo ln -s /etc/nginx/sites-available/bpm /etc/nginx/sites-enabled/ && sudo nginx -t && sudo systemctl reload nginx
```

**Production checklist**

- `NODE_ENV=production`, `REQUIRE_JWT_AUTH=true`, a strong `JWT_SECRET`, `ALLOW_X_USER_EMAIL=false`.
- PostgreSQL bound to localhost only; use a strong `DB_PASSWORD`.
- TLS terminated by nginx; gzip enabled (see the nginx template).
- Rotate logs (`/etc/logrotate.d`) and install the backup cron (see [Backups](#backups)).

## Access control

- **Super Admin** — everything, including AI generation, user/role management and data tools.
- **Admin / Department Manager / Viewer / Vendor** — module permissions per role, optionally
  scoped to specific process functions per user.
- **AI Word export** — Super Admins plus the e-mails listed in `AI_EXPORT_ALLOWED_EMAILS`.
- New users are created with an explicit password; there are no built-in default passwords.

## Backups

```bash
./scripts/backup-bpm-database.sh                 # compressed pg_dump into ./backups
cp scripts/backup-email.env.example scripts/backup-email.env   # SMTP + recipients
./scripts/install-backup-cron.sh                 # schedule e-mailed backups
```

`backups/`, `User_LOG/`, `word-jobs/` and `docx/BPM-Files/` hold runtime data and are
git-ignored — never commit them.

## Useful commands

| Command | Description |
|---------|-------------|
| `npm run install:all` | Install API and web dependencies |
| `npm run dev:api` / `npm run dev:web` | Start the API / the web UI in watch mode |
| `npm run build` | Build both applications |
| `npm run lint` | Lint both applications |
| `npm run api:restart` | Build and restart the systemd service (production host) |

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Deployment runbook](docs/DEPLOYMENT.md)
- [Security notes](docs/SECURITY.md)
- [API environment reference](bpm-api/.env.example)

## Contributing

1. Create a feature branch from `main`.
2. Run `npm run lint` and `npm run build` before opening a pull request.
3. Never commit secrets, `.env` files, database dumps, logs or customer documents.
4. Keep user-facing text in English.

See [CONTRIBUTING.md](CONTRIBUTING.md).
