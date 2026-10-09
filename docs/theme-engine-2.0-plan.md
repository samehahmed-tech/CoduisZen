# Theme Engine 2.0 — Implementation Plan

## Baseline (Phase 0, recorded 2026-10-08)
- `npm run build:frontend` passes (~11s). Full `tsc --noEmit` OOMs at 8GB (pre-existing infra issue, unrelated).
- `tests/userDeleteAndCopy.test.ts` + `tests/userRouteSecurity.test.ts`: 7/7 pass (local SQL Server).
- ESLint: only pre-existing `react-hooks/exhaustive-deps` rule-resolution errors in untouched files.
- Architecture found: React 19 + Vite + Tailwind v4, zustand store, Express + MSSQL (drizzle), CSS-vars theme engine
  (`theme/` registry+provider, `styles/themes/*.css` palettes, `styles/engine/*` layers), settings roam server-side
  for whitelisted keys only (theme, isDarkMode, motionEffects, touch, POS prefs), wallpaper infra exists,
  `AppearanceModal` is the current theme manager (immediate-apply gallery + wallpapers, no preview/rollback/density/colors/presets).
- CodePen refs inspected: Delgado direction-aware 3D hover (atan2 entry detection + rotate3d in/out keyframes);
  Margarita showcase (aurora blobs, SVG noise, conic-border beam via @property, shimmer sweep, JS tilt ±14°,
  scramble text, spotlight, IO reveal, exact-final counters). Reimplemented originally, no deps copied.

## Decisions
- Evolve, don't fork: single `ThemeProvider` + `useAuthStore.settings` remain the runtime (no duplicate provider).
- New pure modules in `theme/engine/` (validation, color, background, motion, presets, resolve, migrate) with fast unit tests.
- 10 new theme ids: meridian, command, glassline, canvas, fluent-pro, material-x, obsidian, tiles, acrylic, touch.
  Old 10 deleted after wiring; migration map covers all generations; default `meridian`.
- New settings fields (`density`, `backgroundConfig`, `colorOverrides`, `motionLevel`) are local-only until server
  whitelists them — documented in docs/theme-engine-2.0.md. theme/mode keep roaming.
- Theme Studio = upgraded `AppearanceModal` (gallery + live-preview-with-rollback + customize + presets).
- No new runtime dependencies. GPU-only motion, reduced-motion + touch guards everywhere.

## Task list (checkpoints: build+tests green after each phase)
- [x] P0 audit + baseline + CodePen investigation
- [ ] P1 engine modules + `tests/theme-engine-2.test.ts` green
- [ ] P2 settings fields + provider (atomic overrides/density/background/motion) + migration
- [ ] P3 ten themes (configs + css + worlds/motion/pos/dashboard/glass/previews) + delete old + grep clean
- [ ] P4 Theme Studio upgrade (preview/rollback, colors, density, background, motion, presets)
- [ ] P9 build + full user-theme tests + detector + docs/theme-engine-2.0.md + verification report

## Risks
| Risk | Mitigation |
|---|---|
| 224-file dirty tree (hotfix workflow) | Touch only theme files; verify via targeted grep/diff |
| tsc OOM | Rely on eslint + vite build + vitest; record as pre-existing |
| Scope overflow | Local-only persistence for new fields; no new deps; studio reuses modal |
