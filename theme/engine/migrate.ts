// THEME ENGINE 2.0 — migration: every retired id → a living V2 id.
// Composed across generations (V6 → V7-first-wave → V2). Unknown ids fall
// back to meridian. Pure data + one function: unit-testable, no DOM.

export const V2_THEME_IDS = [
    'meridian', 'command', 'glassline', 'canvas', 'fluent-pro',
    'material-x', 'obsidian', 'tiles', 'acrylic', 'touch',
] as const;

export type V2ThemeId = (typeof V2_THEME_IDS)[number];

export const FALLBACK_V2: V2ThemeId = 'meridian';

const MIGRATION_MAP: Record<string, V2ThemeId> = {
    // V7 first wave (just retired)
    'glass-prism': 'glassline',
    'mica-noir': 'obsidian',
    'fluent-11': 'fluent-pro',
    'crystal-bloom': 'material-x',
    'terminal-ops': 'command',
    'ledger-paper': 'canvas',
    'neon-souq': 'material-x',
    'mint-oasis': 'acrylic',
    'clay-ember': 'meridian',
    'velvet-noir': 'obsidian',
    // V7 pre-wave
    'ember-noir': 'meridian',
    'saffron-souk': 'canvas',
    'midnight-dune': 'obsidian',
    'matcha-garden': 'acrylic',
    'rose-patissier': 'material-x',
    'abyss-teal': 'command',
    'porcelain-mist': 'fluent-pro',
    'cocoa-truffle': 'meridian',
    'neon-bazaar': 'glassline',
    'olive-grove': 'acrylic',
    // V6 generation
    'fluent-frost': 'glassline',
    'aero-glass': 'glassline',
    'aurora-mesh': 'glassline',
    'aurora-glass': 'glassline',
    'cupertino-mist': 'acrylic',
    'cupertino-noir': 'obsidian',
    'material-bloom': 'material-x',
    'bento-saas': 'tiles',
    'pixel-dusk': 'obsidian',
    'linear-drift': 'command',
    'notion-bone': 'canvas',
    'midnight-command': 'command',
    'neo-brutal': 'material-x',
    'soft-organic': 'acrylic',
    'editorial-luxury': 'canvas',
    'future-hud': 'obsidian',
    'industrial-ops': 'fluent-pro',
    'premium-hospitality': 'meridian',
    'terminal-ops-legacy': 'command',
};

/** Migrate any stored id (any generation) to a living V2 id. Never throws. */
export const migrateThemeId = (stored: unknown): V2ThemeId => {
    if (typeof stored !== 'string' || !stored) return FALLBACK_V2;
    if ((V2_THEME_IDS as readonly string[]).includes(stored)) return stored as V2ThemeId;
    return MIGRATION_MAP[stored] ?? FALLBACK_V2;
};
