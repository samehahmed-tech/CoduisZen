// THEME ENGINE 2.0 — background engine: typed configs, validation, CSS builder.
// Covers solid/gradient/mesh/aurora/textures/image(-overlay)/theme-native.
// Prefers CSS gradients + SVG noise (no WebGL/canvas libraries).

import { clampNum, isHexColor } from './validation';

export type BgType =
    | 'theme-native' | 'solid' | 'linear' | 'radial' | 'mesh' | 'aurora'
    | 'noise' | 'dots' | 'grid' | 'geometric' | 'ambient'
    | 'image' | 'image-overlay' | 'gradient-texture';

export type BgSpeed = 'off' | 'slow' | 'normal';

export interface BackgroundConfig {
    type: BgType;
    /** 1-4 hex colors depending on type. */
    colors?: string[];
    /** gradient angle deg. */
    angle?: number;
    /** effect strength 0..1. */
    intensity?: number;
    /** base layer opacity 0..1. */
    opacity?: number;
    /** texture/pattern opacity 0..0.3. */
    patternOpacity?: number;
    /** ambient animation. */
    speed?: BgSpeed;
    /** allowlisted only: data:image/* or /wallpapers/ path. */
    imageUrl?: string;
    /** overlay color for image-overlay. */
    overlay?: string;
    overlayOpacity?: number;
}

export const DEFAULT_BACKGROUND: BackgroundConfig = { type: 'theme-native' };

const MAX_DATA_URL = 2_500_000;

const isSafeImageUrl = (url: string): boolean => {
    if (url.startsWith('/wallpapers/') && !url.includes('..')) return true;
    if (url.startsWith('data:image/') && url.includes(';base64,') && url.length <= MAX_DATA_URL) return true;
    return false;
};

export const validateBackgroundConfig = (cfg: unknown): string[] => {
    const errors: string[] = [];
    if (typeof cfg !== 'object' || cfg === null || Array.isArray(cfg)) return ['background must be an object'];
    const c = cfg as Record<string, unknown>;
    const types: BgType[] = ['theme-native', 'solid', 'linear', 'radial', 'mesh', 'aurora', 'noise', 'dots', 'grid', 'geometric', 'ambient', 'image', 'image-overlay', 'gradient-texture'];
    if (typeof c.type !== 'string' || !types.includes(c.type as BgType)) return ['background.type invalid'];
    if (c.colors !== undefined) {
        if (!Array.isArray(c.colors) || c.colors.length > 4 || !c.colors.every(isHexColor)) errors.push('background.colors must be 1-4 hex colors');
    }
    for (const [k, min, max] of [['intensity', 0, 1], ['opacity', 0, 1], ['patternOpacity', 0, 0.3], ['overlayOpacity', 0, 0.9], ['angle', 0, 360]] as const) {
        if (c[k] !== undefined && (typeof c[k] !== 'number' || c[k]! < min || c[k]! > max)) errors.push(`background.${k} out of range`);
    }
    if (c.speed !== undefined && !['off', 'slow', 'normal'].includes(c.speed as string)) errors.push('background.speed invalid');
    if ((c.type === 'image' || c.type === 'image-overlay') && (typeof c.imageUrl !== 'string' || !isSafeImageUrl(c.imageUrl))) {
        errors.push('background.imageUrl must be a /wallpapers/ path or data:image (≤2.5MB)');
    }
    if (c.overlay !== undefined && !isHexColor(c.overlay)) errors.push('background.overlay must be hex');
    return errors;
};

export const sanitizeBackgroundConfig = (cfg: unknown): BackgroundConfig => {
    if (typeof cfg !== 'object' || cfg === null || Array.isArray(cfg)) return { ...DEFAULT_BACKGROUND };
    const c = cfg as Record<string, unknown>;
    const out: BackgroundConfig = {
        type: (typeof c.type === 'string' ? c.type : 'theme-native') as BgType,
    };
    if (Array.isArray(c.colors)) out.colors = c.colors.filter(isHexColor).slice(0, 4) as string[];
    if (c.angle !== undefined) out.angle = clampNum(c.angle, 0, 360, 135);
    if (c.intensity !== undefined) out.intensity = clampNum(c.intensity, 0, 1, 0.5);
    if (c.opacity !== undefined) out.opacity = clampNum(c.opacity, 0, 1, 1);
    if (c.patternOpacity !== undefined) out.patternOpacity = clampNum(c.patternOpacity, 0, 0.3, 0.08);
    if (c.speed === 'off' || c.speed === 'slow' || c.speed === 'normal') out.speed = c.speed;
    if (typeof c.imageUrl === 'string' && isSafeImageUrl(c.imageUrl)) out.imageUrl = c.imageUrl;
    if (isHexColor(c.overlay)) out.overlay = c.overlay as string;
    if (c.overlayOpacity !== undefined) out.overlayOpacity = clampNum(c.overlayOpacity, 0, 0.9, 0.45);
    return validateBackgroundConfig(out).length ? { ...DEFAULT_BACKGROUND } : out;
};

const NOISE_URI = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

/** Build a CSS background stack for the app page layer. Pure strings, no DOM. */
export const buildBackgroundCSS = (cfg: BackgroundConfig): { backgroundImage: string; backgroundSize?: string } => {
    const colors = (cfg.colors?.length ? cfg.colors : ['#6366f1', '#8b5cf6', '#06b6d4']).slice(0, 4);
    const angle = cfg.angle ?? 135;
    const pat = cfg.patternOpacity ?? 0.08;
    const a = (hex: string, alpha: number) => {
        const m = hex.replace('#', '');
        const r = parseInt(m.slice(0, 2), 16), g = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16);
        return `rgba(${r},${g},${b},${alpha})`;
    };
    switch (cfg.type) {
        case 'theme-native': return { backgroundImage: 'var(--theme-page-bg)' };
        case 'solid': return { backgroundImage: colors[0] };
        case 'linear': return { backgroundImage: `linear-gradient(${angle}deg, ${colors.join(', ')})` };
        case 'radial': return { backgroundImage: `radial-gradient(circle at 50% 30%, ${colors.join(', ')})` };
        case 'mesh': {
            const [c1, c2, c3] = [colors[0], colors[1] ?? colors[0], colors[2] ?? colors[0]];
            return { backgroundImage: `radial-gradient(800px 380px at 10% 0%, ${a(c1, 0.35)}, transparent 60%), radial-gradient(900px 420px at 90% 10%, ${a(c2, 0.3)}, transparent 60%), radial-gradient(1000px 500px at 50% 110%, ${a(c3, 0.28)}, transparent 60%)` };
        }
        case 'aurora': {
            const [c1, c2, c3] = [colors[0], colors[1] ?? colors[0], colors[2] ?? colors[0]];
            return { backgroundImage: `radial-gradient(70vw 60vh at 10% 10%, ${a(c1, 0.22)}, transparent 70%), radial-gradient(50vw 70vh at 85% 30%, ${a(c2, 0.2)}, transparent 70%), radial-gradient(55vw 55vh at 40% 95%, ${a(c3, 0.2)}, transparent 70%)` };
        }
        case 'noise': return { backgroundImage: `${NOISE_URI}, var(--theme-page-bg)`, backgroundSize: '200px 200px, auto' };
        case 'dots': return { backgroundImage: `repeating-radial-gradient(circle at 0 0, ${a(colors[0], pat)} 0 1px, transparent 1px 26px), var(--theme-page-bg)`, backgroundSize: 'auto, auto' };
        case 'grid': return { backgroundImage: `repeating-linear-gradient(0deg, ${a(colors[0], pat)} 0 1px, transparent 1px 28px), repeating-linear-gradient(90deg, ${a(colors[0], pat)} 0 1px, transparent 1px 28px), var(--theme-page-bg)` };
        case 'geometric': return { backgroundImage: `repeating-linear-gradient(45deg, ${a(colors[0], pat)} 0 2px, transparent 2px 18px), repeating-linear-gradient(-45deg, ${a(colors[0], pat)} 0 2px, transparent 2px 18px), var(--theme-page-bg)` };
        case 'ambient': return { backgroundImage: `radial-gradient(1000px 400px at 50% -10%, ${a(colors[0], 0.16)}, transparent 60%), var(--theme-page-bg)` };
        case 'gradient-texture': return { backgroundImage: `${NOISE_URI}, linear-gradient(${angle}deg, ${colors.join(', ')})`, backgroundSize: '200px 200px, auto' };
        case 'image': return { backgroundImage: `url("${cfg.imageUrl}")`, backgroundSize: 'cover' };
        case 'image-overlay': return { backgroundImage: `linear-gradient(${a(cfg.overlay ?? '#000000', cfg.overlayOpacity ?? 0.08)}, ${a(cfg.overlay ?? '#000000', cfg.overlayOpacity ?? 0.08)}), url("${cfg.imageUrl}")`, backgroundSize: 'cover' };
        default: return { backgroundImage: 'var(--theme-page-bg)' };
    }
};
