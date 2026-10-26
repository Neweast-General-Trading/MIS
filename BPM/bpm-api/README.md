# BPM API

NestJS REST API of the BPM platform. See the [root README](../README.md) for the full picture.

## Requirements

- Node.js ≥ 20, npm ≥ 10
- PostgreSQL 14+ (`docker compose up -d` starts PostgreSQL 16 on `127.0.0.1:55432`)
- Optional: Chrome/Chromium (PDF + Mermaid), Oracle HCM / SAP HANA / SQL Server access

## Setup

```bash
npm install
cp .env.example .env        # fill in DB_*, JWT_SECRET, ADMINISTRATOR_EMAIL, ADMIN_INITIAL_PASSWORD
docker compose up -d        # local PostgreSQL
npm run start:dev           # http://localhost:3000 (watch mode)
```

The database schema is synchronised automatically on start. The administrator account is
created from `ADMINISTRATOR_EMAIL` / `ADMIN_INITIAL_PASSWORD`.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run start:dev` | Watch mode |
| `npm run build` | Compile to `dist/` |
| `npm run start:prod` | Run the compiled build |
| `npm run lint` | ESLint (auto-fix) |
| `npm test` / `npm run test:e2e` | Unit / end-to-end tests |

## Environment

Every variable is documented in [`.env.example`](.env.example).

## Structure

```
src/
├── access-control/   roles, permissions, users, guards
├── auth/             password + Microsoft sign-in, JWT
├── companies/        companies, Oracle/HANA catalog, policy PDFs
├── departments/      process functions, dashboard rollups, imports
├── processes/ activities/ activity-templates/ applications/
├── ai-bpm/           AI generation + Word export pipeline
├── print/            PDF printing
├── oracle/ hana/ sql/ external data sources
└── common/           interceptors, utilities
```

Optional Mermaid renderer (used by Word exports): `npm install --prefix tools/mermaid`.
