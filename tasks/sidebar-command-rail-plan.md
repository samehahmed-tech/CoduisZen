# Implementation Plan: CODUIS XEN Command Rail

## Approved design contract

The interactive prototype in `prototypes/sidebar-design-studio.html` and the user's explicit approval define the visual specification.

## Acceptance criteria

- The desktop rail is 76px when collapsed, expands as a GPU-friendly overlay on hover/focus, and only reserves full width when pinned.
- Brand, navigation, quick actions, hover glow, and click feedback derive from existing theme tokens (`--primary`, `--accent`, background, border, and text tokens).
- Navigation clicks remain responsive, collapse cleanly after selection, and do not throw runtime errors.
- Mobile uses a drawer with no hover dependency.
- Keyboard focus and reduced/off motion modes remain usable.
- The built frontend is verified in the real browser and installed with a rollback backup.

## Slices

1. Add a source-level interaction contract test.
2. Add rail pointer tracking, section numbering, and click-feedback state.
3. Replace the visual layer with the theme-aware Command Rail and kinetic effects.
4. Lint, test, build, browser-test desktop/mobile/theme switching, then install with backup.

## Risks

- Existing theme-specific sidebar overrides may win specificity; keep the final rail layer last and scope all rules to `.workspace-rail-v2`.
- Heavy effects can introduce jank; animate transforms, opacity, and clip-path only and disable decorative motion for reduced/off modes.
- The worktree contains unrelated user changes; modify only the rail component, its final CSS layer, focused tests, and this plan.
