import React, { createContext, useEffect, useMemo } from 'react';
import { useAuthStore } from '../stores/useAuthStore';
import { THEME_REGISTRY, type ThemeConfig } from './tokens';
import type { AppTheme } from '../types';
import auroraGlassThemeUrl from '../styles/themes/aurora-glass.css?url';
import midnightCommandThemeUrl from '../styles/themes/midnight-command.css?url';
import neoBrutalThemeUrl from '../styles/themes/neo-brutal.css?url';
import softOrganicThemeUrl from '../styles/themes/soft-organic.css?url';
import editorialLuxuryThemeUrl from '../styles/themes/editorial-luxury.css?url';
import terminalOpsThemeUrl from '../styles/themes/terminal-ops.css?url';
import futureHudThemeUrl from '../styles/themes/future-hud.css?url';
import bentoSaasThemeUrl from '../styles/themes/bento-saas.css?url';
import industrialOpsThemeUrl from '../styles/themes/industrial-ops.css?url';
import premiumHospitalityThemeUrl from '../styles/themes/premium-hospitality.css?url';

export interface ThemeContextValue {
    theme: AppTheme;
    config: ThemeConfig;
    isDark: boolean;
    setTheme: (theme: AppTheme) => void;
    toggleDark: () => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_STYLESHEET_ID = 'restoflow-theme-stylesheet';

const THEME_STYLESHEET_URLS: Record<AppTheme, string> = {
    'aurora-glass': auroraGlassThemeUrl,
    'midnight-command': midnightCommandThemeUrl,
    'neo-brutal': neoBrutalThemeUrl,
    'soft-organic': softOrganicThemeUrl,
    'editorial-luxury': editorialLuxuryThemeUrl,
    'terminal-ops': terminalOpsThemeUrl,
    'future-hud': futureHudThemeUrl,
    'bento-saas': bentoSaasThemeUrl,
    'industrial-ops': industrialOpsThemeUrl,
    'premium-hospitality': premiumHospitalityThemeUrl,
};

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
    'aurora-glass': {
        '--pos-theme-card-hero-bg': 'radial-gradient(circle at 78% 18%, rgba(34, 211, 238, 0.35), transparent 26%), linear-gradient(135deg, #4f46e5, rgb(var(--primary))), rgb(var(--primary))',
        '--pos-theme-card-hero-text': '255 255 255',
        '--pos-theme-card-hero-muted': '224 231 255',
        '--pos-theme-card-action-bg': 'rgba(255, 255, 255, 0.94)',
        '--pos-theme-card-action-text': 'var(--primary)',
        '--pos-theme-card-control-bg': 'rgba(255, 255, 255, 0.20)',
        '--pos-theme-card-badge-bg': 'rgba(34, 211, 238, 0.9)',
        '--pos-theme-card-pattern-opacity': '0.26',
        '--pos-theme-card-art-ring': 'rgba(255, 255, 255, 0.5)',
    },
    'midnight-command': {
        '--pos-theme-card-hero-bg': 'linear-gradient(135deg, rgb(var(--primary)), #1e293b), rgb(var(--primary))',
        '--pos-theme-card-hero-text': '255 255 255',
        '--pos-theme-card-hero-muted': '220 224 235',
        '--pos-theme-card-action-bg': '#ffffff',
        '--pos-theme-card-action-text': 'var(--primary)',
        '--pos-theme-card-control-bg': 'rgba(10, 14, 25, 0.30)',
        '--pos-theme-card-badge-bg': 'rgb(var(--primary))',
        '--pos-theme-card-pattern-opacity': '0.08',
        '--pos-theme-card-art-ring': 'rgba(255, 255, 255, 0.4)',
    },
    'neo-brutal': {
        '--pos-theme-card-hero-bg': 'rgb(var(--primary))',
        '--pos-theme-card-hero-text': 'var(--bg-card)',
        '--pos-theme-card-hero-muted': 'var(--text-muted)',
        '--pos-theme-card-action-bg': 'rgb(var(--accent))',
        '--pos-theme-card-action-text': '15 15 15',
        '--pos-theme-card-control-bg': 'rgba(var(--bg-elevated), 0.9)',
        '--pos-theme-card-badge-bg': 'rgb(var(--accent))',
        '--pos-theme-card-pattern-opacity': '0',
        '--pos-theme-card-art-ring': 'rgba(var(--border-color), 0.9)',
    },
    'soft-organic': {
        '--pos-theme-card-hero-bg': 'linear-gradient(135deg, rgb(var(--primary)), #e8a87c), rgb(var(--primary))',
        '--pos-theme-card-hero-text': '255 255 255',
        '--pos-theme-card-hero-muted': '255 240 225',
        '--pos-theme-card-action-bg': '#ffffff',
        '--pos-theme-card-action-text': 'var(--primary)',
        '--pos-theme-card-control-bg': 'rgba(90, 60, 40, 0.25)',
        '--pos-theme-card-badge-bg': 'rgba(232, 168, 124, 0.95)',
        '--pos-theme-card-pattern-opacity': '0.14',
        '--pos-theme-card-art-ring': 'rgba(255, 255, 255, 0.5)',
    },
    'editorial-luxury': {
        '--pos-theme-card-hero-bg': 'rgb(var(--bg-card))',
        '--pos-theme-card-hero-text': 'var(--text-main)',
        '--pos-theme-card-hero-muted': 'var(--text-muted)',
        '--pos-theme-card-action-bg': 'rgb(var(--primary))',
        '--pos-theme-card-action-text': 'var(--bg-card)',
        '--pos-theme-card-control-bg': 'rgba(var(--bg-elevated), 0.9)',
        '--pos-theme-card-badge-bg': 'rgb(var(--accent))',
        '--pos-theme-card-pattern-opacity': '0',
        '--pos-theme-card-art-ring': 'rgba(var(--border-color), 0.8)',
    },
    'terminal-ops': {
        '--pos-theme-card-hero-bg': 'linear-gradient(135deg, #0c2b1a, rgb(var(--primary))), rgb(var(--primary))',
        '--pos-theme-card-hero-text': '220 240 225',
        '--pos-theme-card-hero-muted': '150 190 160',
        '--pos-theme-card-action-bg': 'rgb(var(--primary))',
        '--pos-theme-card-action-text': '4 12 8',
        '--pos-theme-card-control-bg': 'rgba(0, 0, 0, 0.35)',
        '--pos-theme-card-badge-bg': 'rgb(var(--primary))',
        '--pos-theme-card-pattern-opacity': '0.18',
        '--pos-theme-card-art-ring': 'rgba(60, 220, 130, 0.5)',
    },
    'future-hud': {
        '--pos-theme-card-hero-bg': 'radial-gradient(circle at 78% 18%, rgba(34, 211, 238, 0.4), transparent 26%), linear-gradient(135deg, #0c2340, rgb(var(--primary))), rgb(var(--primary))',
        '--pos-theme-card-hero-text': '255 255 255',
        '--pos-theme-card-hero-muted': '210 230 250',
        '--pos-theme-card-action-bg': 'rgba(255, 255, 255, 0.95)',
        '--pos-theme-card-action-text': 'var(--primary)',
        '--pos-theme-card-control-bg': 'rgba(0, 0, 0, 0.3)',
        '--pos-theme-card-badge-bg': 'rgba(34, 211, 238, 0.9)',
        '--pos-theme-card-pattern-opacity': '0.24',
        '--pos-theme-card-art-ring': 'rgba(34, 211, 238, 0.55)',
    },
    'bento-saas': {
        '--pos-theme-card-hero-bg': 'linear-gradient(135deg, rgb(var(--primary)), #ec4899), rgb(var(--primary))',
        '--pos-theme-card-hero-text': '255 255 255',
        '--pos-theme-card-hero-muted': '240 230 250',
        '--pos-theme-card-action-bg': '#ffffff',
        '--pos-theme-card-action-text': 'var(--primary)',
        '--pos-theme-card-control-bg': 'rgba(40, 30, 90, 0.25)',
        '--pos-theme-card-badge-bg': 'rgba(236, 72, 153, 0.9)',
        '--pos-theme-card-pattern-opacity': '0.16',
        '--pos-theme-card-art-ring': 'rgba(255, 255, 255, 0.45)',
    },
    'industrial-ops': {
        '--pos-theme-card-hero-bg': 'radial-gradient(circle at 80% 10%, rgba(76,194,255,0.35), transparent 45%), linear-gradient(135deg, #0078d4, #106ebe), rgb(var(--primary))',
        '--pos-theme-card-hero-text': '255 255 255',
        '--pos-theme-card-hero-muted': '220 235 248',
        '--pos-theme-card-action-bg': '#ffffff',
        '--pos-theme-card-action-text': 'var(--primary)',
        '--pos-theme-card-control-bg': 'rgba(0, 0, 0, 0.22)',
        '--pos-theme-card-badge-bg': '#4cc2ff',
        '--pos-theme-card-pattern-opacity': '0.12',
        '--pos-theme-card-art-ring': 'rgba(255, 255, 255, 0.5)',
    },
    'premium-hospitality': {
        '--pos-theme-card-hero-bg': 'radial-gradient(circle at 78% 15%, rgba(212, 175, 105, 0.4), transparent 28%), linear-gradient(135deg, #6e1822, rgb(var(--primary))), rgb(var(--primary))',
        '--pos-theme-card-hero-text': '255 250 240',
        '--pos-theme-card-hero-muted': '235 215 190',
        '--pos-theme-card-action-bg': 'rgba(255, 255, 255, 0.95)',
        '--pos-theme-card-action-text': 'var(--primary)',
        '--pos-theme-card-control-bg': 'rgba(40, 20, 15, 0.30)',
        '--pos-theme-card-badge-bg': 'rgba(212, 175, 105, 0.92)',
        '--pos-theme-card-pattern-opacity': '0.2',
        '--pos-theme-card-art-ring': 'rgba(212, 175, 105, 0.55)',
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
    const tokens = POS_CARD_THEME_TOKENS[theme] ?? POS_CARD_THEME_TOKENS['aurora-glass'];
    Object.entries(tokens).forEach(([key, value]) => {
        root.style.setProperty(key, value);
    });
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const settings = useAuthStore((s) => s.settings);
    const updateSettings = useAuthStore((s) => s.updateSettings);

    // Migrate stored choices from retired (pre-10-personality) theme ids.
    const LEGACY_THEME_MAP: Record<string, AppTheme> = {
        'fluent-frost': 'aurora-glass',
        'aero-glass': 'aurora-glass',
        'aurora-mesh': 'aurora-glass',
        'mica-noir': 'midnight-command',
        'cupertino-noir': 'midnight-command',
        'cupertino-mist': 'soft-organic',
        'material-bloom': 'bento-saas',
        'pixel-dusk': 'future-hud',
        'linear-drift': 'terminal-ops',
        'notion-bone': 'editorial-luxury',
    };
    const storedTheme = settings.theme as string | undefined;
    const themeId = (
        storedTheme && THEME_REGISTRY[storedTheme as AppTheme]
            ? storedTheme
            : (storedTheme && LEGACY_THEME_MAP[storedTheme]) || 'aurora-glass'
    ) as AppTheme;
    const isDark = settings.isDarkMode;
    const config = THEME_REGISTRY[themeId] ?? THEME_REGISTRY['aurora-glass'];

    useEffect(() => {
        const root = document.documentElement;
        const body = document.body;

        root.setAttribute('data-theme', themeId);
        body.setAttribute('data-theme', themeId);
        root.setAttribute('data-motion-style', config.motion.style);
        root.setAttribute('data-interaction-intensity', config.interaction?.intensity ?? 'standard');

        if (isDark) {
            root.classList.add('dark');
            body.classList.add('dark');
        } else {
            root.classList.remove('dark');
            body.classList.remove('dark');
        }

        if (settings.language === 'ar') {
            root.setAttribute('dir', 'rtl');
            root.lang = 'ar';
        } else {
            root.setAttribute('dir', 'ltr');
            root.lang = 'en';
        }

        applyThemeCSSVariables(config);
        applyPOSCardThemeVariables(themeId);

        const shell = document.querySelector('.workspace-shell') as HTMLElement | null;
        if (shell) {
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
            } else {
                shell.removeAttribute('data-wallpaper');
                shell.style.setProperty('--wallpaper-opacity', '0');
                shell.style.removeProperty('--wp-img');
            }
        }
    }, [themeId, isDark, config, settings.language, settings.wallpaper, settings.wallpaperOpacity, settings.customWallpaperUrl]);

    useEffect(() => {
        const href = THEME_STYLESHEET_URLS[themeId] || THEME_STYLESHEET_URLS['aurora-glass'];
        let link = document.getElementById(THEME_STYLESHEET_ID) as HTMLLinkElement | null;

        if (!link) {
            link = document.createElement('link');
            link.id = THEME_STYLESHEET_ID;
            link.rel = 'stylesheet';
            document.head.appendChild(link);
        }

        if (link.getAttribute('href') !== href) {
            link.setAttribute('href', href);
        }
    }, [themeId]);

    const value = useMemo<ThemeContextValue>(
        () => ({
            theme: themeId,
            config,
            isDark,
            setTheme: (t: AppTheme) => updateSettings({ theme: t }),
            toggleDark: () => updateSettings({ isDarkMode: !isDark }),
        }),
        [themeId, config, isDark, updateSettings],
    );

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
