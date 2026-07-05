import React, { createContext, useEffect, useMemo } from 'react';
import { useAuthStore } from '../stores/useAuthStore';
import { THEME_REGISTRY, type ThemeConfig } from './tokens';
import type { AppTheme } from '../types';
import micaGlassThemeUrl from '../styles/themes/mica-glass.css?url';
import fluentCleanThemeUrl from '../styles/themes/fluent-clean.css?url';
import materialSoftThemeUrl from '../styles/themes/material-soft.css?url';
import neumorphismSoftThemeUrl from '../styles/themes/neumorphism-soft.css?url';
import flatMinimalThemeUrl from '../styles/themes/flat-minimal.css?url';
import fintechSharpThemeUrl from '../styles/themes/fintech-sharp.css?url';
import cupertinoLightThemeUrl from '../styles/themes/cupertino-light.css?url';
import monochromeProThemeUrl from '../styles/themes/monochrome-pro.css?url';
import warmBeigeThemeUrl from '../styles/themes/warm-beige.css?url';
import darkElegantThemeUrl from '../styles/themes/dark-elegant.css?url';

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
    'mica-glass': micaGlassThemeUrl,
    'fluent-clean': fluentCleanThemeUrl,
    'material-soft': materialSoftThemeUrl,
    'neumorphism-soft': neumorphismSoftThemeUrl,
    'flat-minimal': flatMinimalThemeUrl,
    'fintech-sharp': fintechSharpThemeUrl,
    'cupertino-light': cupertinoLightThemeUrl,
    'monochrome-pro': monochromeProThemeUrl,
    'warm-beige': warmBeigeThemeUrl,
    'dark-elegant': darkElegantThemeUrl,
};

const POS_CARD_THEME_TOKENS: Record<AppTheme, Record<string, string>> = {
    'mica-glass': {
        '--pos-theme-card-hero-bg': 'radial-gradient(circle at 76% 20%, rgba(var(--primary), 0.2), transparent 25%), linear-gradient(135deg, rgba(var(--bg-card), 0.72), rgba(var(--primary), 0.16)), rgba(var(--bg-card), 0.54)',
        '--pos-theme-card-hero-text': 'var(--text-main)',
        '--pos-theme-card-hero-muted': 'var(--text-muted)',
        '--pos-theme-card-action-bg': 'rgba(var(--primary), 0.95)',
        '--pos-theme-card-action-text': '255 255 255',
        '--pos-theme-card-control-bg': 'rgba(var(--bg-card), 0.42)',
        '--pos-theme-card-badge-bg': 'rgba(var(--primary), 0.88)',
        '--pos-theme-card-pattern-opacity': '0.18',
        '--pos-theme-card-art-ring': 'rgba(var(--primary), 0.34)',
    },
    'fluent-clean': {
        '--pos-theme-card-hero-bg': 'radial-gradient(circle at 78% 18%, rgba(255, 255, 255, 0.14), transparent 24%), linear-gradient(135deg, #182230, rgb(var(--primary))), rgb(var(--primary))',
        '--pos-theme-card-hero-text': '255 255 255',
        '--pos-theme-card-hero-muted': '219 234 254',
        '--pos-theme-card-action-bg': '#ffffff',
        '--pos-theme-card-action-text': 'var(--primary)',
        '--pos-theme-card-control-bg': 'rgba(15, 23, 42, 0.28)',
        '--pos-theme-card-badge-bg': 'rgba(15, 23, 42, 0.78)',
        '--pos-theme-card-pattern-opacity': '0.28',
        '--pos-theme-card-art-ring': 'rgba(255, 255, 255, 0.36)',
    },
    'material-soft': {
        '--pos-theme-card-hero-bg': 'radial-gradient(circle at 78% 20%, rgba(255, 255, 255, 0.18), transparent 24%), linear-gradient(145deg, rgb(var(--primary)), rgba(var(--accent), 0.76)), rgb(var(--primary))',
        '--pos-theme-card-hero-text': '255 255 255',
        '--pos-theme-card-hero-muted': '237 233 254',
        '--pos-theme-card-action-bg': 'rgba(255, 255, 255, 0.94)',
        '--pos-theme-card-action-text': 'var(--primary)',
        '--pos-theme-card-control-bg': 'rgba(255, 255, 255, 0.16)',
        '--pos-theme-card-badge-bg': 'rgba(var(--accent), 0.86)',
        '--pos-theme-card-pattern-opacity': '0.2',
        '--pos-theme-card-art-ring': 'rgba(255, 255, 255, 0.38)',
    },
    'neumorphism-soft': {
        '--pos-theme-card-hero-bg': 'radial-gradient(circle at 78% 18%, rgba(var(--primary), 0.12), transparent 24%), linear-gradient(135deg, rgba(var(--bg-card), 0.98), rgba(var(--primary), 0.1)), rgb(var(--bg-card))',
        '--pos-theme-card-hero-text': 'var(--text-main)',
        '--pos-theme-card-hero-muted': 'var(--text-muted)',
        '--pos-theme-card-action-bg': 'rgb(var(--primary))',
        '--pos-theme-card-action-text': '255 255 255',
        '--pos-theme-card-control-bg': 'rgba(var(--bg-card), 0.82)',
        '--pos-theme-card-badge-bg': 'rgb(var(--primary))',
        '--pos-theme-card-pattern-opacity': '0',
        '--pos-theme-card-art-ring': 'rgba(var(--primary), 0.26)',
    },
    'flat-minimal': {
        '--pos-theme-card-hero-bg': 'rgb(var(--bg-card))',
        '--pos-theme-card-hero-text': 'var(--text-main)',
        '--pos-theme-card-hero-muted': 'var(--text-muted)',
        '--pos-theme-card-action-bg': 'rgb(var(--primary))',
        '--pos-theme-card-action-text': '255 255 255',
        '--pos-theme-card-control-bg': 'rgba(var(--bg-elevated), 0.72)',
        '--pos-theme-card-badge-bg': 'rgb(var(--primary))',
        '--pos-theme-card-pattern-opacity': '0',
        '--pos-theme-card-art-ring': 'rgba(var(--border-color), 0.55)',
    },
    'fintech-sharp': {
        '--pos-theme-card-hero-bg': 'radial-gradient(circle at 78% 18%, rgba(255, 255, 255, 0.1), transparent 24%), linear-gradient(135deg, #061326, rgb(var(--primary))), rgb(var(--primary))',
        '--pos-theme-card-hero-text': '255 255 255',
        '--pos-theme-card-hero-muted': '219 234 254',
        '--pos-theme-card-action-bg': '#ffffff',
        '--pos-theme-card-action-text': 'var(--primary)',
        '--pos-theme-card-control-bg': 'rgba(2, 6, 23, 0.32)',
        '--pos-theme-card-badge-bg': 'rgba(2, 6, 23, 0.78)',
        '--pos-theme-card-pattern-opacity': '0.3',
        '--pos-theme-card-art-ring': 'rgba(var(--primary), 0.52)',
    },
    'cupertino-light': {
        '--pos-theme-card-hero-bg': 'radial-gradient(circle at 76% 18%, rgba(var(--primary), 0.14), transparent 24%), linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(var(--primary), 0.055)), rgb(var(--bg-card))',
        '--pos-theme-card-hero-text': 'var(--text-main)',
        '--pos-theme-card-hero-muted': 'var(--text-muted)',
        '--pos-theme-card-action-bg': 'rgb(var(--primary))',
        '--pos-theme-card-action-text': '255 255 255',
        '--pos-theme-card-control-bg': 'rgba(var(--bg-elevated), 0.76)',
        '--pos-theme-card-badge-bg': 'linear-gradient(180deg, rgb(var(--primary)), rgb(var(--primary-hover)))',
        '--pos-theme-card-pattern-opacity': '0.08',
        '--pos-theme-card-art-ring': 'rgba(var(--primary), 0.36)',
    },
    'monochrome-pro': {
        '--pos-theme-card-hero-bg': 'rgb(var(--bg-card))',
        '--pos-theme-card-hero-text': 'var(--text-main)',
        '--pos-theme-card-hero-muted': 'var(--text-muted)',
        '--pos-theme-card-action-bg': 'rgb(var(--primary))',
        '--pos-theme-card-action-text': '255 255 255',
        '--pos-theme-card-control-bg': 'rgba(var(--bg-elevated), 0.72)',
        '--pos-theme-card-badge-bg': 'rgb(var(--primary))',
        '--pos-theme-card-pattern-opacity': '0',
        '--pos-theme-card-art-ring': 'rgba(var(--border-color), 0.55)',
    },
    'warm-beige': {
        '--pos-theme-card-hero-bg': 'radial-gradient(circle at 78% 18%, rgba(245, 203, 140, 0.2), transparent 24%), linear-gradient(135deg, #463424, rgb(var(--primary))), rgb(var(--primary))',
        '--pos-theme-card-hero-text': '255 255 255',
        '--pos-theme-card-hero-muted': '254 243 199',
        '--pos-theme-card-action-bg': 'rgba(255, 247, 237, 0.96)',
        '--pos-theme-card-action-text': 'var(--primary)',
        '--pos-theme-card-control-bg': 'rgba(63, 45, 32, 0.26)',
        '--pos-theme-card-badge-bg': 'rgba(245, 158, 11, 0.86)',
        '--pos-theme-card-pattern-opacity': '0.18',
        '--pos-theme-card-art-ring': 'rgba(245, 203, 140, 0.56)',
    },
    'dark-elegant': {
        '--pos-theme-card-hero-bg': 'radial-gradient(circle at 78% 18%, rgba(var(--primary), 0.2), transparent 24%), linear-gradient(135deg, #101827, #1e293b), #101827',
        '--pos-theme-card-hero-text': '248 250 252',
        '--pos-theme-card-hero-muted': '203 213 225',
        '--pos-theme-card-action-bg': 'rgb(var(--primary))',
        '--pos-theme-card-action-text': '255 255 255',
        '--pos-theme-card-control-bg': 'rgba(15, 23, 42, 0.55)',
        '--pos-theme-card-badge-bg': 'rgba(var(--primary), 0.86)',
        '--pos-theme-card-pattern-opacity': '0.2',
        '--pos-theme-card-art-ring': 'rgba(var(--primary), 0.48)',
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
}

function applyPOSCardThemeVariables(theme: AppTheme) {
    const root = document.documentElement;
    const tokens = POS_CARD_THEME_TOKENS[theme] ?? POS_CARD_THEME_TOKENS['mica-glass'];
    Object.entries(tokens).forEach(([key, value]) => {
        root.style.setProperty(key, value);
    });
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const settings = useAuthStore((s) => s.settings);
    const updateSettings = useAuthStore((s) => s.updateSettings);

    const themeId = settings.theme || 'mica-glass';
    const isDark = settings.isDarkMode;
    const config = THEME_REGISTRY[themeId] ?? THEME_REGISTRY['mica-glass'];

    useEffect(() => {
        const root = document.documentElement;
        const body = document.body;

        root.setAttribute('data-theme', themeId);
        body.setAttribute('data-theme', themeId);

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
        const href = THEME_STYLESHEET_URLS[themeId] || THEME_STYLESHEET_URLS['mica-glass'];
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
