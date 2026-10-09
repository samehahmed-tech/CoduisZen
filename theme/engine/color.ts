// THEME ENGINE 2.0 — color engine: normalization, derivation, contrast.
// Pure functions; safe to unit test. No DOM access.

import { normalizeHex } from './validation';

export type Rgb = [number, number, number];

/** #rrggbb → [r,g,b] or null. */
export const hexToRgb = (hex: string): Rgb | null => {
    const n = normalizeHex(hex);
    if (!n) return null;
    return [parseInt(n.slice(1, 3), 16), parseInt(n.slice(3, 5), 16), parseInt(n.slice(5, 7), 16)];
};

export const rgbToHex = ([r, g, b]: Rgb): string =>
    '#' + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');

const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

/** Relative luminance 0..1 (WCAG). */
export const luminance = ([r, g, b]: Rgb): number =>
    0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

/** WCAG contrast ratio 1..21. Returns null on invalid input. */
export const contrastRatio = (a: string, b: string): number | null => {
    const ra = hexToRgb(a);
    const rb = hexToRgb(b);
    if (!ra || !rb) return null;
    const [l1, l2] = [luminance(ra), luminance(rb)].sort((x, y) => y - x);
    return (l1 + 0.05) / (l2 + 0.05);
};

/** Readable text color for a background: white or near-black, whichever passes AA (4.5). */
export const bestTextOn = (bgHex: string): '#ffffff' | '#141414' => {
    const white = contrastRatio(bgHex, '#ffffff') ?? 0;
    const black = contrastRatio(bgHex, '#141414') ?? 0;
    if (white >= 4.5 && white >= black) return '#ffffff';
    if (black >= 4.5) return '#141414';
    return white >= black ? '#ffffff' : '#141414';
};

/** Mix two hex colors by t (0 = a, 1 = b). Invalid input returns fallback. */
export const mixHex = (a: string, b: string, t: number, fallback = '#808080'): string => {
    const ra = hexToRgb(a);
    const rb = hexToRgb(b);
    if (!ra || !rb) return fallback;
    const k = Math.min(1, Math.max(0, t));
    return rgbToHex([ra[0] + (rb[0] - ra[0]) * k, ra[1] + (rb[1] - ra[1]) * k, ra[2] + (rb[2] - ra[2]) * k]);
};

/** Darken (amt<0) or lighten (amt>0) a hex color. amt in -1..1. */
export const shadeHex = (hex: string, amt: number, isDark = false): string => {
    const target = amt >= 0 ? (isDark ? '#ffffff' : '#ffffff') : '#000000';
    return mixHex(hex, target, Math.abs(Math.min(1, Math.max(-1, amt))), hex);
};

/** hex → "r, g, b" triplet for rgb(var())-style CSS variables. */
export const hexToTriplet = (hex: string): string | null => {
    const rgb = hexToRgb(hex);
    return rgb ? `${rgb[0]}, ${rgb[1]}, ${rgb[2]}` : null;
};

/** Derive hover/active companions for a primary color. Never touches status colors. */
export const deriveActionScale = (primaryHex: string, isDark: boolean): { hover: string; active: string; soft: string } => {
    const base = normalizeHex(primaryHex) ?? '#6366f1';
    return {
        hover: shadeHex(base, isDark ? 0.12 : -0.12),
        active: shadeHex(base, isDark ? 0.2 : -0.2),
        soft: mixHex(base, isDark ? '#000000' : '#ffffff', isDark ? 0.82 : 0.86, base),
    };
};
