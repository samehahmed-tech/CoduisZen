# Theme Engine 2.0 — Architecture & Guide

Single runtime: `ThemeProvider` + `useAuthStore.settings`. No duplicate providers.

## Modules (`theme/engine/`, pure + tested)
| Module | Responsibility |
|---|---|
| `validation.ts` | Theme configs, hex, densities, motion levels, brand-only overrides |
| `color.ts` | Normalize, mix/shade, WCAG contrast, readable text, action scale |
| `background.ts` | 14 background types, validation (allowlisted images ≤2.5MB), CSS builder |
| `motion.ts` | 10 motion profiles, `useDirectionHover` (RTL-mirrored), `useTilt` (clamped), `useCountUp` (exact final) |
| `presets.ts` | localStorage presets (max 24, built-ins protected, validated import/export) |
| `resolve.ts` | Registry audit, safe fallback (`meridian`), brand-only override merge + contrast warnings |
| `migrate.ts` | Every retired id → living V2 id; unknown → `meridian`; never throws |

## Token precedence
System defaults < theme personality < color mode < user overrides (brand colors only).
Status/focus tokens are never overridable.

## Persistence
- Server-roamed: `theme`, `isDarkMode`, `motionEffects`, touch/POS prefs (existing whitelist).
- Local-only: `density`, `motionLevel`, `colorOverrides`, `backgroundConfig`, presets.
  Documented limitation: new fields roam only after the server whitelists them.

## Themes (10)
meridian (default) · command · glassline · canvas · fluent-pro · material-x · obsidian · tiles · acrylic · touch.
Each: `theme/themes/<id>.ts` + `styles/themes/<id>.css` + worlds/motion/pos/dashboard/glass coverage + Studio preview.

## Theme Studio (`AppearanceModal`)
Gallery (token-based previews, direction/tilt on expressive themes) · live preview with Cancel rollback ·
Reset · brand colors (validated + contrast warnings) · density · motion level · background engine
(type/intensity/speed; uploaded wallpaper always wins) · presets (save/apply/delete, import/export validated).

## Motion rules
GPU-only transforms; `data-motion="off"` / `reduced` / `prefers-reduced-motion` / touch guards;
status pulses are brief (never continuous); financial values never animate (counters: Studio/decorative only, exact final).

## Add a theme
1. `theme/themes/<id>.ts` (validate via `validateThemeConfig`), register in `tokens.ts`, extend `AppTheme`.
2. `styles/themes/<id>.css` (full var contract, light + dark).
3. Worlds + motion + dashboard + POS + glass + Studio preview entries; add legacy mapping in `migrate.ts`.

## Verification
- `npx vitest run tests/theme-engine-2.test.ts` — 18 unit tests (registry, validation, color, background, presets, resolve, migration).
- `npm run build:frontend` must pass; `impeccable detect` on touched UI files must be clean.
- Known pre-existing issues (not caused by this engine): full `tsc --noEmit` OOMs at 8GB; eslint `react-hooks/exhaustive-deps` rule unresolved in repo config.
