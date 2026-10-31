import React, { createContext, useEffect, useMemo } from 'react';
import { useAuthStore } from '../stores/useAuthStore';
import { THEME_REGISTRY, type ThemeConfig } from './tokens';
import { migrateThemeId } from './engine/migrate';
import { sanitizeColorOverrides } from './engine/validation';
import { sanitizeBackgroundConfig, buildBackgroundCSS } from './engine/background';
import { resolveUserOverrides } from './engine/resolve';
import type { AppTheme } from '../types';

export interface ThemeContextValue {
    theme: AppTheme;
    config: ThemeConfig;
    isDark: boolean;
    setTheme: (theme: AppTheme) => void;
    toggleDark: () => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

function applySemanticTokenLayers(config: ThemeConfig) {
    const root = document.documentElement;
    const primitive = config.primitives ?? {
        fontFamily: 'var(--font-body, Cairo, system-ui, sans-serif)',
        fontDisplay: 'var(--font-heading, Cairo, system-ui, sans-serif)',
        fontMono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSizeBase: '16px',
        lineHeight: '1.45',
        focusRingWidth: '3px',
        overlayOpacity: '0.56',
    };
    const interaction = config.interaction ?? {
        intensity: 'standard' as const,
        fast: '140ms',
        normal: config.motion.duration,
        slow: config.motion.durationSlow,
        easeStandard: config.motion.easing,
        easeEmphasized: config.motion.easing,
        easeEnter: config.motion.easing,
        easeExit: 'cubic-bezier(0.4, 0, 1, 1)',
        hoverDistance: '2px',
        pressScale: '0.98',
        hoverScale: '1.01',
    };
    const semantic = config.semantic ?? {
        background: 'rgb(var(--bg-app))',
        backgroundSubtle: 'rgb(var(--bg-global))',
        surface: 'rgb(var(--bg-card))',
        surfaceRaised: 'rgb(var(--bg-elevated))',
        surfaceSunken: 'rgb(var(--bg-app))',
        surfaceOverlay: 'var(--theme-popup-bg, rgb(var(--bg-card)))',
        surfaceHover: 'var(--theme-card-hover-bg, rgb(var(--bg-card)))',
        surfaceActive: 'var(--theme-active-bg, rgba(var(--primary), 0.12))',
        textPrimary: 'rgb(var(--text-main))',
        textSecondary: 'rgb(var(--text-muted))',
        textMuted: 'rgb(var(--text-muted))',
        textDisabled: 'rgba(var(--text-muted), 0.55)',
        textInverse: 'rgb(var(--bg-card))',
        border: 'rgb(var(--border-color))',
        borderSubtle: 'rgba(var(--border-color), 0.5)',
        borderStrong: 'rgba(var(--border-color), 0.9)',
        interactivePrimary: 'rgb(var(--primary))',
        interactiveHover: 'rgb(var(--primary-hover))',
        interactiveActive: 'rgb(var(--primary-hover))',
        statusSuccess: 'rgb(var(--success))',
        statusWarning: 'rgb(var(--warning))',
        statusDanger: 'rgb(var(--danger))',
        statusInfo: 'rgb(var(--info))',
        focus: 'var(--theme-focus-ring, rgba(var(--primary), 0.24))',
        selection: 'rgba(var(--primary), 0.18)',
    };
    const values: Record<string, string> = {
        '--primitive-font-family': primitive.fontFamily,
        '--primitive-font-display': primitive.fontDisplay,
        '--primitive-font-mono': primitive.fontMono,
        '--primitive-font-size-base': primitive.fontSizeBase,
        '--primitive-line-height': primitive.lineHeight,
        '--primitive-focus-ring-width': primitive.focusRingWidth,
        '--primitive-overlay-opacity': primitive.overlayOpacity,
        '--motion-fast': interaction.fast,
        '--motion-normal': interaction.normal,
        '--motion-slow': interaction.slow,
        '--ease-standard': interaction.easeStandard,
        '--ease-emphasized': interaction.easeEmphasized,
        '--ease-enter': interaction.easeEnter,
        '--ease-exit': interaction.easeExit,
        '--interaction-intensity': interaction.intensity,
        '--interaction-hover-distance': interaction.hoverDistance,
        '--interaction-press-scale': interaction.pressScale,
        '--interaction-hover-scale': interaction.hoverScale,
    };
    Object.entries(semantic).forEach(([key, value]) => {
        values[`--semantic-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`] = value;
    });
    Object.entries(values).forEach(([key, value]) => root.style.setProperty(key, value));
}

const POS_CARD_THEME_TOKENS: Record<AppTheme, Record<string, string>> = {
    'aero': {
        '--pos-theme-card-hero-bg': 'radial-gradient(circle at 78% 18%, rgba(191,227,255,0.45), transparent 28%), linear-gradient(135deg, #0a5c99, #2f9fd8)',
        '--pos-theme-card-hero-text': '255 255 255',
        '--pos-theme-card-hero-muted': '222 240 255',
        '--pos-theme-card-control-bg': 'rgba(7, 45, 75, 0.32)',
        '--pos-theme-card-pattern-opacity': '0.12',
        '--pos-theme-card-art-ring': 'rgba(255, 255, 255, 0.5)',
    },
    'citrus': {
        '--pos-theme-card-hero-bg': 'linear-gradient(135deg, #d6f05f, #f4a23c)',
        '--pos-theme-card-hero-text': '43 36 21',
        '--pos-theme-card-hero-muted': '92 75 30',
        '--pos-theme-card-control-bg': 'rgba(43, 36, 21, 0.18)',
        '--pos-theme-card-pattern-opacity': '0.1',
        '--pos-theme-card-art-ring': 'rgba(43, 36, 21, 0.35)',
    },
    'porcelain': {
        '--pos-theme-card-hero-bg': 'linear-gradient(135deg, #efece6, #d8d1c5)',
        '--pos-theme-card-hero-text': '25 24 23',
        '--pos-theme-card-hero-muted': '98 92 84',
        '--pos-theme-card-control-bg': 'rgba(25, 24, 23, 0.08)',
        '--pos-theme-card-pattern-opacity': '0.05',
        '--pos-theme-card-art-ring': 'rgba(25, 24, 23, 0.3)',
    },
    'blueprint': {
        '--pos-theme-card-hero-bg': 'linear-gradient(135deg, #0d4f86, #1565a0)',
        '--pos-theme-card-hero-text': '255 255 255',
        '--pos-theme-card-hero-muted': '206 229 246',
        '--pos-theme-card-control-bg': 'rgba(6, 38, 64, 0.3)',
        '--pos-theme-card-pattern-opacity': '0.18',
        '--pos-theme-card-art-ring': 'rgba(255, 255, 255, 0.4)',
    },
    'clay': {
        '--pos-theme-card-hero-bg': 'linear-gradient(135deg, #d97b45, #a94e2f)',
        '--pos-theme-card-hero-text': '255 248 240',
        '--pos-theme-card-hero-muted': '250 224 205',
        '--pos-theme-card-control-bg': 'rgba(49, 37, 27, 0.28)',
        '--pos-theme-card-pattern-opacity': '0.1',
        '--pos-theme-card-art-ring': 'rgba(255, 248, 240, 0.45)',
    },
    'nocturne': {
        '--pos-theme-card-hero-bg': 'radial-gradient(circle at 78% 18%, rgba(212,175,122,0.35), transparent 28%), linear-gradient(135deg, #0c1626, #1a2740)',
        '--pos-theme-card-hero-text': '245 238 225',
        '--pos-theme-card-hero-muted': '212 199 176',
        '--pos-theme-card-control-bg': 'rgba(0, 0, 0, 0.42)',
        '--pos-theme-card-pattern-opacity': '0.08',
        '--pos-theme-card-art-ring': 'rgba(212, 175, 122, 0.45)',
    },
    'foundry': {
        '--pos-theme-card-hero-bg': 'linear-gradient(135deg, #c2410c, #7c2d12)',
        '--pos-theme-card-hero-text': '255 245 235',
        '--pos-theme-card-hero-muted': '246 214 190',
        '--pos-theme-card-control-bg': 'rgba(0, 0, 0, 0.42)',
        '--pos-theme-card-pattern-opacity': '0.14',
        '--pos-theme-card-art-ring': 'rgba(255, 245, 235, 0.4)',
    },
    'neon': {
        '--pos-theme-card-hero-bg': 'radial-gradient(circle at 78% 18%, rgba(34,211,238,0.4), transparent 28%), linear-gradient(135deg, #ff2e88, #7c3aed)',
        '--pos-theme-card-hero-text': '255 255 255',
        '--pos-theme-card-hero-muted': '255 224 240',
        '--pos-theme-card-control-bg': 'rgba(20, 4, 20, 0.42)',
        '--pos-theme-card-pattern-opacity': '0.18',
        '--pos-theme-card-art-ring': 'rgba(255, 255, 255, 0.45)',
    },
    'slate': {
        '--pos-theme-card-hero-bg': 'linear-gradient(135deg, #13211c, #1f3a30)',
        '--pos-theme-card-hero-text': '226 240 232',
        '--pos-theme-card-hero-muted': '170 199 184',
        '--pos-theme-card-control-bg': 'rgba(0, 0, 0, 0.4)',
        '--pos-theme-card-pattern-opacity': '0.1',
        '--pos-theme-card-art-ring': 'rgba(93, 224, 164, 0.4)',
    },
    'cinema': {
        '--pos-theme-card-hero-bg': 'radial-gradient(circle at 78% 18%, rgba(212,175,122,0.38), transparent 28%), linear-gradient(135deg, #0b0b0c, #1a1712)',
        '--pos-theme-card-hero-text': '246 240 228',
        '--pos-theme-card-hero-muted': '203 187 156',
        '--pos-theme-card-control-bg': 'rgba(0, 0, 0, 0.48)',
        '--pos-theme-card-pattern-opacity': '0.08',
        '--pos-theme-card-art-ring': 'rgba(212, 175, 122, 0.5)',
    },
};
function applyThemeCSSVariables(config: ThemeConfig) {
    const root = document.documentElement;

    root.style.setProperty('--theme-radius', config.shape.radius);
    root.style.setProperty('--theme-radius-sm', config.shape.radiusSm);
    root.style.setProperty('--theme-radius-lg', config.shape.radiusLg);
    root.style.setProperty('--theme-radius-xl', config.shape.radiusXl);
    root.style.setProperty('--theme-blur', config.surfaces.blur);
    root.style.setProperty('--theme-surface-opacity', String(config.surfaces.surfaceOpacity));
    root.style.setProperty('--theme-border-width', config.surfaces.borderWidth);
    root.style.setProperty('--theme-border-opacity', String(config.surfaces.borderOpacity));
    root.style.setProperty('--theme-shadow-card', config.shadows.card);
    root.style.setProperty('--theme-shadow-hover', config.shadows.hover);
    root.style.setProperty('--theme-shadow-elevated', config.shadows.elevated);
    root.style.setProperty('--theme-ease', config.motion.easing);
    root.style.setProperty('--theme-duration', config.motion.duration);
    root.style.setProperty('--theme-duration-slow', config.motion.durationSlow);
    root.style.setProperty('--theme-font-weight', String(config.typography.fontWeight));
    root.style.setProperty('--theme-heading-weight', String(config.typography.headingWeight));
    root.style.setProperty('--theme-letter-spacing', config.typography.letterSpacing);

    root.style.setProperty('--theme-spacing-unit', config.spacing.unit);
    root.style.setProperty('--theme-density', String(config.spacing.density));
    root.style.setProperty('--theme-gap', config.spacing.gap);
    root.style.setProperty('--theme-section-gap', config.spacing.sectionGap);
    root.style.setProperty('--theme-container-padding', config.layout.containerPadding);

    root.style.setProperty('--theme-button-height', config.components.button.height);
    root.style.setProperty('--theme-button-padding', config.components.button.padding);
    root.style.setProperty('--theme-button-variant', config.components.button.variant);
    root.style.setProperty('--theme-card-variant', config.components.card.variant);
    root.style.setProperty('--theme-sidebar-variant', config.components.sidebar.variant);
    root.style.setProperty('--theme-sidebar-width', config.components.sidebar.width);
    root.style.setProperty('--theme-sidebar-collapsed-width', config.components.sidebar.collapsedWidth);
    root.style.setProperty('--theme-table-row-height', config.components.table.rowHeight);
    root.style.setProperty('--theme-input-height', config.components.input.height);
    root.style.setProperty('--theme-input-variant', config.components.input.variant);
    root.style.setProperty('--theme-modal-variant', config.components.modal.variant);
    root.style.setProperty('--theme-layout-density', config.layout.density);
    applySemanticTokenLayers(config);
}

function applyPOSCardThemeVariables(theme: AppTheme) {
    const root = document.documentElement;
    const tokens = POS_CARD_THEME_TOKENS[theme] ?? POS_CARD_THEME_TOKENS.aero;
    Object.entries(tokens).forEach(([key, value]) => {
        root.style.setProperty(key, value);
    });
    // Controls follow mode surfaces; RGB channel values are consumed inside rgb().
    root.style.setProperty('--pos-theme-card-action-bg', 'rgb(var(--bg-elevated))');
    root.style.setProperty('--pos-theme-card-action-text', 'var(--text-main)');
    root.style.setProperty('--pos-theme-card-badge-bg', 'rgb(var(--bg-elevated))');
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const settings = useAuthStore((s) => s.settings);
    const updateSettings = useAuthStore((s) => s.updateSettings);

    // V5 migration: any stored id from any generation resolves to a living theme.
    const storedTheme = settings.theme as string | undefined;
    const themeId = migrateThemeId(storedTheme);
    const isDark = settings.isDarkMode ?? false;
    const config = THEME_REGISTRY[themeId as AppTheme] ?? THEME_REGISTRY.aero;

    // Every V5 theme owns both palettes. `defaultMode` is only the initial
    // preference when a theme is selected; it must not lock the user out of
    // the opposite mode after the theme is active.

    useEffect(() => {
        const root = document.documentElement;
        const body = document.body;

        root.setAttribute('data-theme', themeId);
        body.setAttribute('data-theme', themeId);
        root.setAttribute('data-motion-style', config.motion.style);
        // Motion Engine 2.0: three levels. Legacy boolean preserved (false = off).
        const motionLevel = settings.motionLevel || (settings.motionEffects === false ? 'off' : 'full');
        root.setAttribute('data-motion-level', motionLevel);
        // Motion effects master switch (settings, default ON for beauty).
        root.setAttribute('data-motion', motionLevel === 'off' ? 'off' : 'on');
        root.setAttribute('data-motion-reduced', motionLevel === 'reduced' ? 'true' : 'false');
        root.setAttribute('data-interaction-intensity', config.interaction?.intensity ?? 'standard');
        // Density drives density.css scale vars via shell class (applied below).

        if (isDark) {
            root.classList.add('dark');
            body.classList.add('dark');
        } else {
            root.classList.remove('dark');
            body.classList.remove('dark');
        }
        // Native controls (date inputs, scrollbars, form widgets) follow the
        // active mode on every theme instead of staying light.
        root.style.setProperty('color-scheme', isDark ? 'dark' : 'light');

        if (settings.language === 'ar') {
            root.setAttribute('dir', 'rtl');
            root.lang = 'ar';
        } else {
            root.setAttribute('dir', 'ltr');
            root.lang = 'en';
        }

        applyThemeCSSVariables(config);
        applyPOSCardThemeVariables(themeId as AppTheme);
        // Color Engine 2.0: validated brand-only overrides win over the theme
        // personality (status/focus tokens are never overridable). Stale inline
        // vars are removed so Reset truly restores theme defaults — atomic.
        const { vars: overrideVars } = resolveUserOverrides(sanitizeColorOverrides(settings.colorOverrides), isDark);
        for (const key of ['--primary', '--primary-hover', '--secondary', '--accent']) {
            if (key in overrideVars) root.style.setProperty(key, overrideVars[key]);
            else root.style.removeProperty(key);
        }

        const shell = document.querySelector('.workspace-shell') as HTMLElement | null;
        if (shell) {
            // Density 2.0: explicit class drives density.css scale vars.
            shell.classList.remove('density-compact', 'density-comfortable', 'density-spacious');
            shell.classList.add(`density-${settings.density || 'comfortable'}`);
            shell.setAttribute('data-density', settings.density || 'comfortable');
            const wp = settings.wallpaper || 'none';
            const wpOpacity = settings.wallpaperOpacity ?? 0.15;
            if (wp && wp !== 'none') {
                shell.setAttribute('data-wallpaper', wp);
                shell.style.setProperty('--wallpaper-opacity', String(wpOpacity));
                if (wp === 'custom' && settings.customWallpaperUrl) {
                    shell.style.setProperty('--wp-img', `url(${settings.customWallpaperUrl})`);
                } else {
                    shell.style.removeProperty('--wp-img');
                }
                // A chosen wallpaper image always wins over the background engine.
                shell.removeAttribute('data-bg-engine');
                shell.style.removeProperty('--te2-bg-image');
                shell.style.removeProperty('--te2-bg-size');
                shell.style.removeProperty('--te2-bg-opacity');
            } else {
                shell.removeAttribute('data-wallpaper');
                shell.style.setProperty('--wallpaper-opacity', '0');
                shell.style.removeProperty('--wp-img');
                // Background Engine 2.0: validated config paints the shell layer.
                const bgCfg = sanitizeBackgroundConfig(settings.backgroundConfig);
                if (bgCfg.type !== 'theme-native') {
                    const built = buildBackgroundCSS(bgCfg);
                    shell.style.setProperty('--te2-bg-image', built.backgroundImage);
                    shell.style.setProperty('--te2-bg-opacity', String(bgCfg.opacity ?? 0.82));
                    if (built.backgroundSize) shell.style.setProperty('--te2-bg-size', built.backgroundSize);
                    else shell.style.removeProperty('--te2-bg-size');
                    shell.setAttribute('data-bg-engine', bgCfg.type);
                    shell.setAttribute('data-bg-speed', bgCfg.speed || 'off');
                } else {
                    shell.removeAttribute('data-bg-engine');
                    shell.removeAttribute('data-bg-speed');
                    shell.style.removeProperty('--te2-bg-image');
                    shell.style.removeProperty('--te2-bg-size');
                    shell.style.removeProperty('--te2-bg-opacity');
                }
            }
        }
    }, [themeId, isDark, config, settings.language, settings.wallpaper, settings.wallpaperOpacity, settings.customWallpaperUrl, settings.density, settings.backgroundConfig]);

    const value = useMemo<ThemeContextValue>(
        () => ({
            theme: themeId,
            config,
            isDark,
            setTheme: (t: AppTheme) => {
                const next = THEME_REGISTRY[t];
                if (!next) return;
                updateSettings({ theme: t, isDarkMode: next.defaultMode === 'dark' });
            },
            toggleDark: () => updateSettings({ isDarkMode: !isDark }),
        }),
        [themeId, config, isDark, updateSettings],
    );

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
