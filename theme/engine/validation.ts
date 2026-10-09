// THEME ENGINE 2.0 — validation: theme configs, colors, backgrounds, presets.
// All user-controlled theme input passes through here. Malformed input
// fails safely (null/false/errors) and never breaks startup.

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export const isHexColor = (value: unknown): value is string =>
    typeof value === 'string' && HEX_RE.test(value.trim());

/** Normalize to lowercase #rrggbb, or null when invalid. */
export const normalizeHex = (value: unknown): string | null => {
    if (!isHexColor(value)) return null;
    let h = value.trim().toLowerCase();
    if (h.length === 4) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
    return h;
};

export const clampNum = (value: unknown, min: number, max: number, fallback: number): number => {
    const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : (typeof value === 'number' ? value : NaN);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);

const BUTTON_VARIANTS = ['soft', 'glass', 'solid', 'tile'] as const;
const CARD_VARIANTS = ['elevated', 'glass', 'flat'] as const;
const SIDEBAR_VARIANTS = ['solid', 'floating', 'blurred'] as const;
const TABLE_DENSITIES = ['dense', 'comfortable'] as const;
const INPUT_VARIANTS = ['outline', 'filled', 'glass'] as const;
const MODAL_VARIANTS = ['centered', 'sheet', 'floating'] as const;
const MOTION_STYLES = ['smooth', 'springy', 'crisp', 'decelerate', 'elastic', 'instant', 'bouncy', 'ease-out'] as const;
const LAYOUT_DENSITIES = ['compact', 'normal', 'spacious'] as const;
const DENSITIES = ['compact', 'comfortable', 'spacious'] as const;
const MOTION_LEVELS = ['full', 'reduced', 'off'] as const;

const isDuration = (v: unknown) => typeof v === 'string' && /^\d+(\.\d+)?m?s$/.test(v);
const isOneOf = <T extends string>(v: unknown, list: readonly T[]): v is T =>
    typeof v === 'string' && (list as readonly string[]).includes(v);

/** Structural validation of a theme config object. Returns error list (empty = valid). */
export const validateThemeConfig = (cfg: unknown): string[] => {
    const errors: string[] = [];
    if (!isRecord(cfg)) return ['config must be an object'];
    if (typeof cfg.id !== 'string' || !cfg.id) errors.push('id required');
    if (typeof cfg.name !== 'string' || !cfg.name) errors.push('name required');
    if (typeof cfg.description !== 'string' || !cfg.description) errors.push('description required');
    if (!Array.isArray(cfg.tags)) errors.push('tags must be an array');
    const shape = cfg.shape as Record<string, unknown> | undefined;
    if (!isRecord(shape) || !['radius', 'radiusSm', 'radiusLg', 'radiusXl'].every((k) => typeof shape[k] === 'string')) {
        errors.push('shape.radius* required');
    }
    const motion = cfg.motion as Record<string, unknown> | undefined;
    if (!isRecord(motion) || !isOneOf(motion.style, MOTION_STYLES) || !isDuration(motion.duration) || !isDuration(motion.durationSlow)) {
        errors.push('motion {style,duration,durationSlow} invalid');
    }
    const components = cfg.components as Record<string, any> | undefined;
    if (!isRecord(components)) {
        errors.push('components required');
    } else {
        if (!isOneOf(components.button?.variant, BUTTON_VARIANTS)) errors.push('components.button.variant invalid');
        if (!isOneOf(components.card?.variant, CARD_VARIANTS)) errors.push('components.card.variant invalid');
        if (!isOneOf(components.sidebar?.variant, SIDEBAR_VARIANTS)) errors.push('components.sidebar.variant invalid');
        if (!isOneOf(components.table?.density, TABLE_DENSITIES)) errors.push('components.table.density invalid');
        if (!isOneOf(components.input?.variant, INPUT_VARIANTS)) errors.push('components.input.variant invalid');
        if (!isOneOf(components.modal?.variant, MODAL_VARIANTS)) errors.push('components.modal.variant invalid');
    }
    const layout = cfg.layout as Record<string, unknown> | undefined;
    if (!isRecord(layout) || !isOneOf((layout as any).density, LAYOUT_DENSITIES)) errors.push('layout.density invalid');
    return errors;
};

export const isValidDensity = (v: unknown): v is 'compact' | 'comfortable' | 'spacious' =>
    isOneOf(v, DENSITIES);

export const isValidMotionLevel = (v: unknown): v is 'full' | 'reduced' | 'off' =>
    isOneOf(v, MOTION_LEVELS);

/** Color overrides are limited to brand roles — status/focus can never be overridden. */
export const sanitizeColorOverrides = (v: unknown): { primary?: string; secondary?: string; accent?: string } => {
    if (!isRecord(v)) return {};
    const out: { primary?: string; secondary?: string; accent?: string } = {};
    for (const key of ['primary', 'secondary', 'accent'] as const) {
        const n = normalizeHex(v[key]);
        if (n) out[key] = n;
    }
    return out;
};
