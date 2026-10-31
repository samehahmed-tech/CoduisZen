// THEME ENGINE 2.0 — resolver: registry validation, safe fallbacks, precedence.
// Precedence: system defaults < theme personality < color mode < user overrides.
// Status/focus tokens are never overridable.

import { THEME_REGISTRY, type ThemeConfig } from '../tokens';
import { validateThemeConfig } from './validation';
import { contrastRatio, deriveActionScale, hexToTriplet } from './color';

export const FALLBACK_THEME_ID = 'aero';

export interface ResolvedTheme {
    id: string;
    config: ThemeConfig;
    warnings: string[];
}

/** Validate the whole registry: unique ids, required fields. */
export const auditRegistry = (registry: Record<string, ThemeConfig>): string[] => {
    const errors: string[] = [];
    const ids = Object.keys(registry);
    if (new Set(ids).size !== ids.length) errors.push('duplicate theme ids');
    for (const [id, cfg] of Object.entries(registry)) {
        if (cfg.id !== id) errors.push(`${id}: config.id mismatch (${cfg.id})`);
        for (const e of validateThemeConfig(cfg)) errors.push(`${id}: ${e}`);
    }
    return errors;
};

/** Resolve a theme id to a guaranteed-valid config (fallback + warnings, never throws). */
export const resolveTheme = (id: unknown, registry: Record<string, ThemeConfig> = THEME_REGISTRY): ResolvedTheme => {
    const warnings: string[] = [];
    const key = typeof id === 'string' ? id : '';
    const found = key && registry[key];
    if (found && validateThemeConfig(found).length === 0) return { id: key, config: found, warnings };
    if (found) warnings.push(`theme "${key}" invalid (${validateThemeConfig(found).join('; ')}), using fallback`);
    else if (key) warnings.push(`unknown theme "${key}", using fallback`);
    const fallback = registry[FALLBACK_THEME_ID] ?? Object.values(registry)[0];
    return { id: fallback.id, config: fallback, warnings };
};

/** Merge brand-only user overrides onto theme vars. Returns CSS var map + warnings. */
export const resolveUserOverrides = (
    overrides: { primary?: string; secondary?: string; accent?: string } | undefined,
    isDark: boolean,
): { vars: Record<string, string>; warnings: string[] } => {
    const vars: Record<string, string> = {};
    const warnings: string[] = [];
    if (!overrides) return { vars, warnings };
    if (overrides.primary) {
        const trip = hexToTriplet(overrides.primary);
        if (trip) {
            const scale = deriveActionScale(overrides.primary, isDark);
            vars['--primary'] = trip;
            vars['--primary-hover'] = hexToTriplet(scale.hover) ?? trip;
            const surface = isDark ? '#101418' : '#ffffff';
            const ratio = contrastRatio(overrides.primary, surface);
            if (ratio !== null && ratio < 3) {
                warnings.push(`primary ${overrides.primary} is low-contrast on surfaces (${ratio.toFixed(1)}:1) — buttons may be hard to see`);
            }
        }
    }
    if (overrides.secondary) {
        const trip = hexToTriplet(overrides.secondary);
        if (trip) vars['--secondary'] = trip;
    }
    if (overrides.accent) {
        const trip = hexToTriplet(overrides.accent);
        if (trip) vars['--accent'] = trip;
    }
    return { vars, warnings };
};
