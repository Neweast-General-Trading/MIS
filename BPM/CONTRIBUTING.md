# Contributing

## Workflow

1. Branch from `main`: `git checkout -b feature/short-description`.
2. Make focused commits using [Conventional Commits](https://www.conventionalcommits.org/)
   (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`).
3. Before pushing run:
   ```bash
   npm run lint
   npm run build
   ```
4. Open a pull request describing **what** changed and **why**, with screenshots for UI work.

## Code style

- TypeScript everywhere; no `any` unless unavoidable.
- Backend: one NestJS module per domain; DTOs validated with `class-validator`.
- Frontend: product code lives in `material-kit-react/src/sections/bpm`; use the shared
  `request()` helper in `api.ts` for all HTTP calls and Iconify icons registered in
  `src/components/iconify/icon-sets.ts`.
- Run `npx eslint --fix` on touched frontend files (import order is enforced).
- User-facing text is English.
- Use the toast helpers already present in the UI for notifications instead of `alert()`.

## Never commit

- `.env` files, API keys, passwords, tokens, certificates
- Database dumps, backups, logs (`backups/`, `User_LOG/`, `*.log`)
- Customer or company documents (`bpm-api/docx/BPM-Files/`, `word-jobs/`)

If a secret is committed by mistake, rotate it immediately — removing it from history is
not enough.
