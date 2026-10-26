# New East MIS

Management information dashboards for New East Group. Shared API plus Vite front-ends. HANA and SQL Server access is **read-only**. Writes go only to local files or local audit storage — never to SAP or payroll.

## Layout

| Folder | Role | Dev port | Vite `base` |
| --- | --- | --- | --- |
| `hub/` | Group Analysis hub | 4014 | `/` |
| `client/` | Work Load Analysis | 4013 | `/WorkLoadAnalysis/` |
| `attendance/` | Attendance Discrepancy | 4014 | `/AttendanceDiscrepancy/` |
| `hq-attendance/` | HQ Access & Attendance | 4022 | `/hq-attendance/` |
| `PFB/` | eOrder Analysis | 4016 | `/PFB/` |
| `ksa-intercompany/` | KSA Intercompany | 4017 | `/ksa/intercompany/` |
| `vehicle-sales/` | KSA Vehicle Sales Track | 4018 | `/ksa/vehicle-sales/` |
| `ne02-approval/` | NE02 Approval Requirements | 4018 | `/ne02-approval/` |
| `audit-trail/` | Audit Log UI | 4019 | `/audit-log/` |
| `server/` | Shared Express API | 4012 | — |
| `nginx/` | Host nginx reference | — | — |
| `kyc-flow/` | KYC walkthrough assets | — | — |
| `BPM/` | BPM platform (also its own repository) | — | — |

Node **20+** is required.

## Secrets (do not commit)

Passwords, API keys, SMTP, JWT, and session secrets stay on the machine only.

```bash
cp server/.env.example server/.env
cp BPM/bpm-api/.env.example BPM/bpm-api/.env
```

`.gitignore` blocks `.env`, `*.secret`, BPM dumps, and unpublished apps.

## 1. Shared API (`server/`)

```bash
cd server
cp .env.example .env   # then edit
npm install
npm run build
npm start              # http://127.0.0.1:4012
npm run dev            # watch mode
```

Health check: `GET /api/health`

Production process:

```bash
pm2 start ecosystem.config.cjs
# after code changes:
cd server && npm run build && pm2 restart mis-dashboard-api
```

`ecosystem.config.cjs` runs `server/dist/index.js`. Reverse-proxy the API host to port **4012**.

| Method | Path |
| --- | --- |
| GET | `/api/health` |
| GET | `/api/dashboard/lst5yrs` |
| GET | `/api/attendance/discrepancy` |
| GET | `/api/hq-attendance` |
| GET | `/api/eorder/sales-order-summary` |
| GET | `/api/intercompany-ksa` |
| GET | `/api/vehicle-sales-track` |
| GET | `/api/ne02-approval` |
| GET | `/api/dts/dashboard` |
| GET | `/api/audit-log` |

HANA user must have `EXECUTE` on the procedures the dashboards call. HQ attendance also needs SQL Server `NEGT_HQ_ATTN` and payroll `NEGTPAYROLL_UAE` (department lookup by `HRM_EmpId`).

## 2. Front-ends (Vite)

```bash
cd hq-attendance   # or any UI folder
npm install
npm run dev
```

Vite `server.proxy` is used only in development. Production builds call the shared API origin configured in each app.

### Production build

From the repo root on the MIS host:

```bash
./deploy-client.sh
```

That script builds the hub and listed UIs into `/var/www/mis-dashboard/`. Then reload nginx. Reference config: `nginx/mis.neweast.cloud.conf`. TLS material and `.htpasswd` stay on the server.

## 3. BPM (`BPM/`)

NestJS API + React UI. Follow `BPM/README.md`.

```bash
cd BPM
npm run install:all
cp bpm-api/.env.example bpm-api/.env
npm run dev:api
npm run dev:web
```

## 4. KYC walkthrough (`kyc-flow/`)

Static HTML and English/Arabic MP4 under `kyc-flow/walkthrough/`. Not the live KYC application.

## New host checklist

1. Clone this repository (private).
2. Copy `.env.example` files and fill credentials **on the machine only**.
3. `cd server && npm install && npm run build`
4. `pm2 start ecosystem.config.cjs && pm2 save`
5. Run `./deploy-client.sh`
6. Point nginx at `/var/www/mis-dashboard` and proxy the API to `:4012`
7. Confirm `curl -sS http://127.0.0.1:4012/api/health`

## Repository rules

- Never commit `.env`, tokens, or database dumps.
- Never grant HANA/SQL write from these apps.
- Front-end `base` paths must stay in sync with nginx `location` blocks.
- Keep this GitHub remote private.
