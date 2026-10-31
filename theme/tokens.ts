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

/** Raw values. Themes may override these without changing components. */
export interface PrimitiveTokens {
    fontFamily: string;
    fontDisplay: string;
    fontMono: string;
    fontSizeBase: string;
    lineHeight: string;
    focusRingWidth: string;
    overlayOpacity: string;
}

/** Meaning-based values consumed by shared UI. */
export interface SemanticTokens {
    background: string;
    backgroundSubtle: string;
    surface: string;
    surfaceRaised: string;
    surfaceSunken: string;
    surfaceOverlay: string;
    surfaceHover: string;
    surfaceActive: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    textDisabled: string;
    textInverse: string;
    border: string;
    borderSubtle: string;
    borderStrong: string;
    interactivePrimary: string;
    interactiveHover: string;
    interactiveActive: string;
    statusSuccess: string;
    statusWarning: string;
    statusDanger: string;
    statusInfo: string;
    focus: string;
    selection: string;
}

export interface InteractionTokens {
    intensity: 'subtle' | 'standard' | 'expressive';
    fast: string;
    normal: string;
    slow: string;
    easeStandard: string;
    easeEmphasized: string;
    easeEnter: string;
    easeExit: string;
    hoverDistance: string;
    pressScale: string;
    hoverScale: string;
}

export interface EffectsTokens {
    pageBackground: string;
    cardBackground: string;
    cardHoverBackground: string;
    railBackground: string;
    topbarBackground: string;
    inputBackground: string;
    tableHeaderBackground: string;
    buttonBackground: string;
    focusRing: string;
}

/* ═══════════════════════════════════════════════
   Master Theme Config — full UI personality
   ═══════════════════════════════════════════════ */
export interface ThemeConfig {
    id: string;
    name: string;
    description: string;
    tags: string[];
    /** Engine 2.0: gallery grouping + defaults. All optional (backward compatible). */
    category?: string;
    defaultMode?: 'light' | 'dark';
    background?: import('./engine/background').BackgroundConfig;
    shape: ShapeTokens;
    surfaces: SurfaceTokens;
    shadows: ShadowTokens;
    motion: MotionTokens;
    typography: TypographyTokens;
    spacing: SpacingTokens;
    components: ComponentTokens;
    layout: LayoutTokens;
    primitives?: PrimitiveTokens;
    semantic?: SemanticTokens;
    interaction?: InteractionTokens;
    effects?: EffectsTokens;
}

import {
    aeroTheme,
    citrusTheme,
    porcelainTheme,
    blueprintTheme,
    clayTheme,
    nocturneTheme,
    foundryTheme,
    neonTheme,
    slateTheme,
    cinemaTheme,
} from './themes/v5';

export const THEME_REGISTRY: Record<AppTheme, ThemeConfig> = {
    aero: aeroTheme,
    citrus: citrusTheme,
    porcelain: porcelainTheme,
    blueprint: blueprintTheme,
    clay: clayTheme,
    nocturne: nocturneTheme,
    foundry: foundryTheme,
    neon: neonTheme,
    slate: slateTheme,
    cinema: cinemaTheme,
};

export const THEME_LIST: ThemeConfig[] = Object.values(THEME_REGISTRY);
