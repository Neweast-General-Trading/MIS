# Security notes

## Secrets

- All credentials live in `bpm-api/.env` (never committed). Use `chmod 600`.
- Rotate `JWT_SECRET`, database, Oracle, SAP HANA, SQL Server, SMTP and API keys if they were
  ever shared or committed.
- Do **not** store tokens inside git remote URLs; use a credential helper or SSH keys.

## Authentication

- Passwords are hashed with bcrypt. New users must be created with an explicit password;
  the first administrator password comes from `ADMIN_INITIAL_PASSWORD` (or is generated and
  printed once in the log).
- Enforce sessions in production: `REQUIRE_JWT_AUTH=true` and `ALLOW_X_USER_EMAIL=false`.
- Disabled users and disabled roles cannot sign in.

## Authorisation

- Server-side guards decide access (`@RequirePermission`, `@RequireSuperAdmin`,
  `@RequireAiAccess`); the UI only hides controls.
- AI Word export is limited to Super Admins plus `AI_EXPORT_ALLOWED_EMAILS`.

## Data protection

- Keep PostgreSQL on `127.0.0.1`.
- `backups/`, `User_LOG/` (contains e-mail addresses and IPs), `word-jobs/` and
  `docx/BPM-Files/` hold business data and are git-ignored.
- Serve the app over HTTPS only (HSTS is set in the nginx template).

## Reporting a vulnerability

Contact the BPM administrators directly; do not open a public issue for security problems.
