# BPM Web

React single-page application of the BPM platform. See the [root README](../README.md) for the
full picture.

Built with React 19, TypeScript, Vite 6 and Material UI 7. The shell started from the MIT-licensed
[Minimal UI – Material Kit React](https://github.com/minimal-ui-kit/material-kit-react) template
(see [LICENSE.md](LICENSE.md)).

## Requirements

- Node.js ≥ 20

## Setup

```bash
npm install
cp .env.example .env        # VITE_API_BASE_URL=http://localhost:3000
npm run dev                 # http://localhost:5173
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check and build to `dist/` |
| `npm start` | Preview the production build |
| `npm run lint` / `npm run lint:fix` | ESLint |
| `npm run fm:check` / `npm run fm:fix` | Prettier |

## Structure

```
src/
├── sections/bpm/     product code — view/ (pages), components/, api.ts, access-control.ts
├── routes/           lazy route definitions and guards
├── layouts/          dashboard layout and navigation
├── components/       shared UI building blocks (charts, iconify, tables…)
└── theme/            MUI theme
```

## Notes

- All HTTP calls go through `request()` in `src/sections/bpm/api.ts` (short read cache,
  in-flight de-duplication, automatic invalidation on writes).
- Icons must be registered in `src/components/iconify/icon-sets.ts`.
- Run `npx eslint --fix` before building; import order is enforced.
