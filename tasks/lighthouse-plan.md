# Lighthouse Audit Plan — Restoflow ERP (Vite SPA, not Next.js)

Evidence: `package.json` (react 19.2.4, vite 6.2, express 5.2, no next dep),
`routes.tsx` (react-router createBrowserRouter, 62 canonical routes),
`stores/useAuthStore.ts` (JWT, localStorage `auth_token`, SUPER_ADMIN bypass),
backend live on :3001 (DB connected, `needsSetup:false`), frontend served from
`dist/` via `vite preview` on :3000.

Adaptation: no Next.js concepts apply. SPA auth = seed `auth_token` in shared
Chrome profile, run Lighthouse CLI with `--disable-storage-reset` so session
survives across runs. Public: `/login`, `/setup`. Excluded: `/t/:id` (needs
real order id), 5 redirect aliases (kitchen, packing, security, people, roles).

System (3 files, zero new deps — lighthouse via npx, chrome via puppeteer):
- `scripts/lighthouse/routes.json` — page registry (59 testable routes)
- `scripts/lighthouse/run.mjs` — login, seed, run desktop+mobile, summaries
- `scripts/lighthouse/report.mjs` — `reports/lighthouse/index.html` + compare
- `npm run lighthouse:all` = run + report

Env: `LH_EMAIL/LH_PASSWORD` or existing `LOAD_AUTH_*` / `DEV_BOOTSTRAP_*` in
`.env.local` (never printed). `LH_ONLY=/pos,/orders` subsets. `LH_MAX_PAGES`
caps. Thresholds warn-only by default (`LH_MIN_PERF` to enforce).
