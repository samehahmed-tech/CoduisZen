# Ten theme redesign

Scope: retain existing theme IDs and saved preferences; distinguish component geometry, navigation treatment, tables, materials, typography and motion in both modes. Keep the fixed, pin-controlled rail and existing business flows.

| Theme | Direction | Structural identity |
| --- | --- | --- |
| Solstice | Warm ivory and gold | Framed panels, top rules, generous spacing |
| Blueprint | Precision operations | Compact corners, fine grid, technical labels |
| Halo | Lavender glass | Rounded panels, translucent depth, pill search |
| Atelier | Paper and terracotta | Editorial rules, flat surfaces, serif headings |
| Studio | Neutral indigo workspace | Restrained elevation, clear section divisions |
| Midnight | Navy and violet | Deep panels, pill actions and inputs |
| Vanta | Monochrome | Hairline framing, quiet surfaces, minimal motion |
| Nebula | Plum and cyan | Asymmetric modular corners, grouped navigation |
| Prism | Teal iridescence | Frosted surfaces, soft outlines and layered depth |
| Ember | Warm tactile | Large controls, heavier outlines, touch spacing |

Acceptance: ten IDs retained, both modes readable, primary/muted text and action labels >=4.5:1 in palette tests, responsive RTL previews, keyboard focus, reduced motion respected. No database operations required.

Verification commands: `npx vitest --config vitest.theme.config.ts run`, `npm run build`. Visual fixture: `/output/theme-review.html` on the Vite development server. It uses real shared styles with illustrative data; it does not replace authenticated end-to-end testing.
