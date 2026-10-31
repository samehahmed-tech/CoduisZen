// THEME ENGINE 2.0 — migration: every retired id → a living V5 id.
// Unknown ids fall back to aero. Pure data + one function: unit-testable, no DOM.

export const V2_THEME_IDS = [
    'aero', 'citrus', 'porcelain', 'blueprint', 'clay',
    'nocturne', 'foundry', 'neon', 'slate', 'cinema',
] as const;

export type V2ThemeId = (typeof V2_THEME_IDS)[number];

export const FALLBACK_V2: V2ThemeId = 'aero';

const MIGRATION_MAP: Record<string, V2ThemeId> = {
    // Previous 10-theme generation.
    'meridian': 'clay',
    'command': 'blueprint',
    'glassline': 'aero',
    'canvas': 'porcelain',
    'fluent-pro': 'citrus',
    'material-x': 'nocturne',
    'obsidian': 'slate',
    'tiles': 'neon',
    'acrylic': 'cinema',
    'touch': 'foundry',
    // V7 first wave.
    'glass-prism': 'aero',
    'mica-noir': 'slate',
    'fluent-11': 'citrus',
    'crystal-bloom': 'nocturne',
    'terminal-ops': 'blueprint',
    'ledger-paper': 'porcelain',
    'neon-souq': 'neon',
    'mint-oasis': 'cinema',
    'clay-ember': 'clay',
    'velvet-noir': 'slate',
    // V7 pre-wave.
    'ember-noir': 'clay',
    'saffron-souk': 'porcelain',
    'midnight-dune': 'slate',
    'matcha-garden': 'cinema',
    'rose-patissier': 'nocturne',
    'abyss-teal': 'blueprint',
    'porcelain-mist': 'porcelain',
    'cocoa-truffle': 'clay',
    'neon-bazaar': 'neon',
    'olive-grove': 'cinema',
    // V6 generation.
    'fluent-frost': 'aero',
    'aero-glass': 'aero',
    'aurora-mesh': 'aero',
    'aurora-glass': 'aero',
    'cupertino-mist': 'cinema',
    'cupertino-noir': 'slate',
    'material-bloom': 'nocturne',
    'bento-saas': 'neon',
    'pixel-dusk': 'slate',
    'linear-drift': 'blueprint',
    'notion-bone': 'porcelain',
    'midnight-command': 'blueprint',
    'neo-brutal': 'citrus',
    'soft-organic': 'cinema',
    'editorial-luxury': 'porcelain',
    'future-hud': 'slate',
    'industrial-ops': 'foundry',
    'premium-hospitality': 'nocturne',
    'terminal-ops-legacy': 'blueprint',
};

/** Migrate any stored id (any generation) to a living V5 id. Never throws. */
export const migrateThemeId = (stored: unknown): V2ThemeId => {
    if (typeof stored !== 'string' || !stored) return FALLBACK_V2;
    if ((V2_THEME_IDS as readonly string[]).includes(stored)) return stored as V2ThemeId;
    return MIGRATION_MAP[stored] ?? FALLBACK_V2;
};
