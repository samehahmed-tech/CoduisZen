// ═══════════════════════════════════════════════════════════════════
//  THEME ENGINE — Design Token Type System
//  Every theme implements this contract to produce a full UI personality
// ═══════════════════════════════════════════════════════════════════

import type { AppTheme } from '../types';

/* ── Shape Tokens ── */
export interface ShapeTokens {
    radius: string;       // e.g. '14px'
    radiusSm: string;
    radiusLg: string;
    radiusXl: string;
}

/* ── Surface Tokens ── */
export interface SurfaceTokens {
    blur: string;         // e.g. '12px'
    surfaceOpacity: number; // 0–1
    borderWidth: string;
    borderOpacity: number;
}

/* ── Shadow Tokens ── */
export interface ShadowTokens {
    card: string;
    hover: string;
    elevated: string;
}

/* ── Motion / Animation Tokens ── */
export type MotionStyle = 'smooth' | 'springy' | 'crisp' | 'decelerate' | 'elastic' | 'instant' | 'bouncy' | 'ease-out';

export interface MotionTokens {
    style: MotionStyle;
    easing: string;       // CSS cubic-bezier
    duration: string;     // e.g. '200ms'
    durationSlow: string;
}

/* ── Typography Tokens ── */
export interface TypographyTokens {
    fontWeight: number;
    headingWeight: number;
    letterSpacing: string;
}

/* ── Spacing / Density ── */
export interface SpacingTokens {
    unit: string;         // base spacing unit e.g. '1rem'
    density: number;      // multiplier: 0.85 = compact, 1 = normal, 1.2 = spacious
    gap: string;          // standard gap between elements
    sectionGap: string;   // gap between major sections
}

/* ── Component Variant Tokens ── */
export type ButtonVariant = 'soft' | 'glass' | 'solid' | 'tile';
export type CardVariant = 'elevated' | 'glass' | 'flat';
export type SidebarVariant = 'solid' | 'floating' | 'blurred';
export type TableDensity = 'dense' | 'comfortable';
export type InputVariant = 'outline' | 'filled' | 'glass';
export type ModalVariant = 'centered' | 'sheet' | 'floating';

export interface ComponentTokens {
    button: {
        variant: ButtonVariant;
        height: string;
        padding: string;
    };
    card: {
        variant: CardVariant;
    };
    sidebar: {
        variant: SidebarVariant;
        width: string;
        collapsedWidth: string;
    };
    table: {
        density: TableDensity;
        rowHeight: string;
    };
    input: {
        variant: InputVariant;
        height: string;
    };
    modal: {
        variant: ModalVariant;
    };
}

/* ── Layout Tokens ── */
export interface LayoutTokens {
    sidebarStyle: SidebarVariant;
    cardStyle: CardVariant;
    density: 'compact' | 'normal' | 'spacious';
    containerPadding: string;
}

/* ═══════════════════════════════════════════════
   Master Theme Config — full UI personality
   ═══════════════════════════════════════════════ */
export interface ThemeConfig {
    id: AppTheme;
    name: string;
    description: string;
    tags: string[];
    shape: ShapeTokens;
    surfaces: SurfaceTokens;
    shadows: ShadowTokens;
    motion: MotionTokens;
    typography: TypographyTokens;
    spacing: SpacingTokens;
    components: ComponentTokens;
    layout: LayoutTokens;
}

import { micaGlassTheme } from './themes/mica-glass';
import { fluentCleanTheme } from './themes/fluent-clean';
import { materialSoftTheme } from './themes/material-soft';
import { neumorphismSoftTheme } from './themes/neumorphism-soft';
import { flatMinimalTheme } from './themes/flat-minimal';
import { fintechSharpTheme } from './themes/fintech-sharp';
import { cupertinoLightTheme } from './themes/cupertino-light';
import { monochromeProTheme } from './themes/monochrome-pro';
import { warmBeigeTheme } from './themes/warm-beige';
import { darkElegantTheme } from './themes/dark-elegant';

export const THEME_REGISTRY: Record<AppTheme, ThemeConfig> = {
    'mica-glass': micaGlassTheme,
    'fluent-clean': fluentCleanTheme,
    'material-soft': materialSoftTheme,
    'neumorphism-soft': neumorphismSoftTheme,
    'flat-minimal': flatMinimalTheme,
    'fintech-sharp': fintechSharpTheme,
    'cupertino-light': cupertinoLightTheme,
    'monochrome-pro': monochromeProTheme,
    'warm-beige': warmBeigeTheme,
    'dark-elegant': darkElegantTheme
};

export const THEME_LIST: ThemeConfig[] = Object.values(THEME_REGISTRY);
