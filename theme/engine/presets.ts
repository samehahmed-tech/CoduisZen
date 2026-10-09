// THEME ENGINE 2.0 — presets: validated user presets in localStorage.
// Built-ins are protected. Imported JSON is validated (no code, capped size).

import type { BackgroundConfig } from './background';
import { sanitizeBackgroundConfig } from './background';
import { sanitizeColorOverrides } from './validation';

export type DensitySetting = 'compact' | 'comfortable' | 'spacious';
export type MotionLevel = 'full' | 'reduced' | 'off';

export interface ThemePreset {
    id: string;
    name: string;
    themeId: string;
    mode: 'light' | 'dark';
    density: DensitySetting;
    motionLevel: MotionLevel;
    colorOverrides?: { primary?: string; secondary?: string; accent?: string };
    background?: BackgroundConfig;
    createdAt: number;
    builtIn?: boolean;
}

export const BUILT_IN_PRESETS: ThemePreset[] = [
    { id: 'preset-ops-night', name: 'Ops Night', themeId: 'obsidian', mode: 'dark', density: 'compact', motionLevel: 'reduced', createdAt: 0, builtIn: true },
    { id: 'preset-studio-day', name: 'Studio Day', themeId: 'glassline', mode: 'light', density: 'comfortable', motionLevel: 'full', createdAt: 0, builtIn: true },
    { id: 'preset-pos-rush', name: 'POS Rush', themeId: 'touch', mode: 'light', density: 'spacious', motionLevel: 'reduced', createdAt: 0, builtIn: true },
];

const STORAGE_KEY = 'coduiszen_theme_presets_v1';
const MAX_PRESETS = 24;

const store = () => {
    try {
        if (typeof localStorage === 'undefined') return null;
        return localStorage;
    } catch { return null; }
};

/** Validate imported/loaded preset JSON. Returns preset or null (never throws, never code). */
export const sanitizePreset = (raw: unknown, validThemeIds: string[]): ThemePreset | null => {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== 'string' || !r.id || r.id.length > 64) return null;
    if (typeof r.name !== 'string' || !r.name.trim() || r.name.length > 48) return null;
    if (typeof r.themeId !== 'string' || !validThemeIds.includes(r.themeId)) return null;
    if (r.mode !== 'light' && r.mode !== 'dark') return null;
    if (!['compact', 'comfortable', 'spacious'].includes(r.density as string)) return null;
    if (!['full', 'reduced', 'off'].includes(r.motionLevel as string)) return null;
    return {
        id: r.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || `preset-${Date.now()}`,
        name: r.name.trim().slice(0, 48),
        themeId: r.themeId,
        mode: r.mode,
        density: r.density as DensitySetting,
        motionLevel: r.motionLevel as MotionLevel,
        colorOverrides: sanitizeColorOverrides(r.colorOverrides),
        background: r.background !== undefined ? sanitizeBackgroundConfig(r.background) : undefined,
        createdAt: typeof r.createdAt === 'number' ? r.createdAt : Date.now(),
    };
};

export const listPresets = (validThemeIds: string[]): ThemePreset[] => {
    const s = store();
    if (!s) return [...BUILT_IN_PRESETS];
    try {
        const raw = JSON.parse(s.getItem(STORAGE_KEY) || '[]');
        if (!Array.isArray(raw)) return [...BUILT_IN_PRESETS];
        const user = raw.map((p) => sanitizePreset(p, validThemeIds)).filter((p): p is ThemePreset => !!p && !p.builtIn);
        return [...BUILT_IN_PRESETS, ...user.slice(0, MAX_PRESETS)];
    } catch { return [...BUILT_IN_PRESETS]; }
};

export const savePreset = (preset: Omit<ThemePreset, 'createdAt' | 'builtIn'>, validThemeIds: string[]): ThemePreset | null => {
    const clean = sanitizePreset({ ...preset, createdAt: Date.now() }, validThemeIds);
    if (!clean) return null;
    const s = store();
    if (!s) return clean;
    try {
        const current = listPresets(validThemeIds).filter((p) => !p.builtIn && p.id !== clean.id);
        const next = [...current, clean].slice(-MAX_PRESETS);
        s.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch { /* quota — keep in-memory result */ }
    return clean;
};

export const deletePreset = (id: string, validThemeIds: string[]): boolean => {
    if (BUILT_IN_PRESETS.some((p) => p.id === id)) return false;
    const s = store();
    if (!s) return true;
    try {
        const next = listPresets(validThemeIds).filter((p) => !p.builtIn && p.id !== id);
        s.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch { /* ignore */ }
    return true;
};

export const exportPreset = (preset: ThemePreset): string => JSON.stringify(preset);

export const importPreset = (json: string, validThemeIds: string[]): ThemePreset | null => {
    if (json.length > 8192) return null;
    try {
        return sanitizePreset(JSON.parse(json), validThemeIds);
    } catch { return null; }
};
