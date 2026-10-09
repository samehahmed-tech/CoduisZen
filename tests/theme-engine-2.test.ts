// THEME ENGINE 2.0 — unit tests (pure modules, no DB, no DOM).
import { describe, expect, it } from 'vitest';
import { isHexColor, normalizeHex, clampNum, validateThemeConfig, sanitizeColorOverrides, isValidDensity, isValidMotionLevel } from '../theme/engine/validation';
import { hexToRgb, contrastRatio, bestTextOn, mixHex, deriveActionScale, hexToTriplet } from '../theme/engine/color';
import { validateBackgroundConfig, sanitizeBackgroundConfig, buildBackgroundCSS } from '../theme/engine/background';
import { sanitizePreset, importPreset, deletePreset, BUILT_IN_PRESETS } from '../theme/engine/presets';
import { resolveTheme, resolveUserOverrides, auditRegistry } from '../theme/engine/resolve';
import { migrateThemeId, V2_THEME_IDS } from '../theme/engine/migrate';
import { MOTION_PROFILES } from '../theme/engine/motion';
import { THEME_REGISTRY } from '../theme/tokens';

const IDS = [...V2_THEME_IDS];

describe('validation', () => {
    it('normalizes hex colors', () => {
        expect(normalizeHex('#FFF')).toBe('#ffffff');
        expect(normalizeHex('#6366F1')).toBe('#6366f1');
        expect(normalizeHex('red')).toBeNull();
        expect(normalizeHex('#12345')).toBeNull();
        expect(isHexColor('#abc')).toBe(true);
    });
    it('clamps numbers with fallback', () => {
        expect(clampNum('0.5', 0, 1, 0)).toBe(0.5);
        expect(clampNum(9, 0, 1, 0)).toBe(1);
        expect(clampNum('junk', 0, 1, 0.7)).toBe(0.7);
    });
    it('accepts a well-formed theme config', () => {
        expect(validateThemeConfig({
            id: 'meridian', name: 'Meridian', description: 'd', tags: [],
            shape: { radius: 'a', radiusSm: 'a', radiusLg: 'a', radiusXl: 'a' },
            motion: { style: 'smooth', duration: '200ms', durationSlow: '400ms' },
            components: { button: { variant: 'solid' }, card: { variant: 'flat' }, sidebar: { variant: 'solid' }, table: { density: 'dense' }, input: { variant: 'outline' }, modal: { variant: 'centered' } },
            layout: { density: 'compact' },
        })).toEqual([]);
    });
    it('rejects malformed configs and enums', () => {
        expect(validateThemeConfig(null)).toContain('config must be an object');
        expect(validateThemeConfig({ id: 'x' }).length).toBeGreaterThan(0);
        expect(isValidDensity('huge')).toBe(false);
        expect(isValidDensity('compact')).toBe(true);
        expect(isValidMotionLevel('off')).toBe(true);
        expect(isValidMotionLevel('hyper')).toBe(false);
    });
    it('sanitizes color overrides to brand roles only', () => {
        expect(sanitizeColorOverrides({ primary: '#ff0000', success: '#00ff00', danger: 'red', junk: 1 })).toEqual({ primary: '#ff0000' });
        expect(sanitizeColorOverrides('nope')).toEqual({});
    });
});

describe('color engine', () => {
    it('computes known contrast ratios', () => {
        expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
        expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 0);
        expect(contrastRatio('nope', '#fff')).toBeNull();
    });
    it('picks readable text', () => {
        expect(bestTextOn('#0b0e17')).toBe('#ffffff');
        expect(bestTextOn('#fafafa')).toBe('#141414');
    });
    it('mixes and derives scales', () => {
        expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
        expect(hexToTriplet('#ff0000')).toBe('255, 0, 0');
        expect(hexToTriplet('bad')).toBeNull();
        const scale = deriveActionScale('#6366f1', false);
        expect(scale.hover).not.toBe('#6366f1');
        expect(hexToRgb('#6366f1')).toEqual([99, 102, 241]);
    });
});

describe('background engine', () => {
    it('rejects bad configs', () => {
        expect(validateBackgroundConfig(null).length).toBeGreaterThan(0);
        expect(validateBackgroundConfig({ type: 'warp' }).length).toBeGreaterThan(0);
        expect(validateBackgroundConfig({ type: 'linear', colors: ['red'] }).length).toBeGreaterThan(0);
        expect(validateBackgroundConfig({ type: 'image', imageUrl: 'https://evil.example/x.png' }).length).toBeGreaterThan(0);
        expect(validateBackgroundConfig({ type: 'image', imageUrl: '/wallpapers/x.png' })).toEqual([]);
    });
    it('sanitizes and builds CSS', () => {
        expect(sanitizeBackgroundConfig('junk')).toEqual({ type: 'theme-native' });
        const mesh = buildBackgroundCSS({ type: 'mesh', colors: ['#ff0000', '#00ff00'] });
        expect(mesh.backgroundImage).toContain('radial-gradient');
        const img = buildBackgroundCSS({ type: 'image', imageUrl: '/wallpapers/ember.png' });
        expect(img.backgroundImage).toContain('/wallpapers/ember.png');
        const native = buildBackgroundCSS({ type: 'theme-native' });
        expect(native.backgroundImage).toBe('var(--theme-page-bg)');
    });
});

describe('presets', () => {
    it('protects built-ins and validates imports', () => {
        expect(deletePreset('preset-ops-night', IDS)).toBe(false);
        expect(importPreset('not json', IDS)).toBeNull();
        expect(importPreset(JSON.stringify({ id: 'x', name: 'X', themeId: 'nope', mode: 'dark', density: 'compact', motionLevel: 'full' }), IDS)).toBeNull();
        const ok = importPreset(JSON.stringify({ id: 'my-preset', name: 'Mine', themeId: 'meridian', mode: 'dark', density: 'compact', motionLevel: 'full', colorOverrides: { primary: '#123456' } }), IDS);
        expect(ok?.themeId).toBe('meridian');
        expect(BUILT_IN_PRESETS.length).toBe(3);
    });
    it('sanitizes oversized and dirty presets', () => {
        expect(sanitizePreset({ id: 'a'.repeat(100), name: 'N', themeId: 'meridian', mode: 'light', density: 'spacious', motionLevel: 'reduced' }, IDS)).toBeNull();
        expect(sanitizePreset({ id: 'ok', name: 'Ok', themeId: 'meridian', mode: 'light', density: 'spacious', motionLevel: 'reduced', background: { type: 'warp' } }, IDS)?.background?.type).toBe('theme-native');
    });
});

describe('resolver and migration', () => {
    it('falls back safely with warnings', () => {
        const r = resolveTheme('ghost-theme');
        expect(r.config).toBeDefined();
        expect(r.warnings.length).toBeGreaterThan(0);
    });
    it('flags low-contrast overrides without breaking', () => {
        const { vars, warnings } = resolveUserOverrides({ primary: '#f5f5f5' }, false);
        expect(vars['--primary']).toBe('245, 245, 245');
        expect(warnings.length).toBeGreaterThan(0);
        const clean = resolveUserOverrides(undefined, false);
        expect(clean.vars).toEqual({});
    });
    it('audits registry mismatches', () => {
        expect(auditRegistry({ a: { id: 'b' } as any })).toContain('a: config.id mismatch (b)');
    });
    it('migrates every generation', () => {
        expect(migrateThemeId('meridian')).toBe('meridian');
        expect(migrateThemeId('glass-prism')).toBe('glassline');
        expect(migrateThemeId('ember-noir')).toBe('meridian');
        expect(migrateThemeId('aurora-glass')).toBe('glassline');
        expect(migrateThemeId('')).toBe('meridian');
        expect(migrateThemeId(null)).toBe('meridian');
        expect(migrateThemeId('nope')).toBe('meridian');
        expect(V2_THEME_IDS.length).toBe(10);
    });
    it('covers all ten motion profiles', () => {
        for (const id of V2_THEME_IDS) expect(MOTION_PROFILES[id]).toBeDefined();
    });
    it('ships a clean ten-theme registry', () => {
        expect(Object.keys(THEME_REGISTRY).sort()).toEqual([...V2_THEME_IDS].sort());
        expect(auditRegistry(THEME_REGISTRY)).toEqual([]);
    });
});
