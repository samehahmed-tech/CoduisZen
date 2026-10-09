import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
    Check,
    ImagePlus,
    Languages,
    LayoutDashboard,
    LayoutGrid,
    MonitorSmartphone,
    Moon,
    Palette,
    Sun,
    Trash2,
    X,
    RotateCcw,
    Save,
    Pipette,
    Layers,
    Gauge,
} from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
import { THEME_LIST, type ThemeConfig } from '../../theme/tokens';
import type { AppTheme } from '../../types';
import { MOTION_PROFILES, useDirectionHover, useTilt, useCountUp } from '../../theme/engine/motion';
import { sanitizeColorOverrides } from '../../theme/engine/validation';
import { sanitizeBackgroundConfig, type BackgroundConfig, type BgType } from '../../theme/engine/background';
import { listPresets, savePreset, deletePreset, type ThemePreset } from '../../theme/engine/presets';
import { resolveUserOverrides } from '../../theme/engine/resolve';
import { V2_THEME_IDS } from '../../theme/engine/migrate';

type PreviewPalette = {
    primary: string;
    accent: string;
    bg: string;
    card: string;
    rail: string;
    text: string;
    muted: string;
    border: string;
    button: string;
};

const THEME_PREVIEW: Record<AppTheme, { light: PreviewPalette; dark: PreviewPalette; moodAr: string; moodEn: string }> = {
    'meridian': {
        moodAr: 'الافتراضي الفاخر',
        moodEn: 'Premium default',
        light: { primary: '#4f46e5', accent: '#4f46e5', bg: '#f6f7f9', card: '#ffffff', rail: '#fafbfd', text: '#0f172a', muted: '#64748b', border: '#e2e8f0', button: 'linear-gradient(135deg,#4f46e5,#6d28d9)' },
        dark: { primary: '#818cf8', accent: '#818cf8', bg: '#10141a', card: '#171c24', rail: '#12161d', text: '#f1f5f9', muted: '#94a3b8', border: '#2c3442', button: 'linear-gradient(135deg,#6366f1,#8b5cf6)' },
    },
    'command': {
        moodAr: 'غرفة العمليات',
        moodEn: 'Ops command',
        light: { primary: '#0284c7', accent: '#d97706', bg: '#f1f4f6', card: '#ffffff', rail: '#f4f6f8', text: '#0c141c', muted: '#5a6978', border: '#d6dee6', button: '#0284c7' },
        dark: { primary: '#38bdf8', accent: '#fbbf24', bg: '#080d12', card: '#0d141b', rail: '#0a1016', text: '#e6f2fa', muted: '#8296a8', border: '#1e2a37', button: '#0284c7' },
    },
    'glassline': {
        moodAr: 'زجاج فاخر',
        moodEn: 'Glass flagship',
        light: { primary: '#6366f1', accent: '#06b6d4', bg: '#eef1f8', card: '#ffffff', rail: '#ffffff', text: '#14192d', muted: '#646e87', border: '#ffffff', button: 'linear-gradient(135deg,#6366f1,#8b5cf6)' },
        dark: { primary: '#a5b4fc', accent: '#22d3ee', bg: '#0a0d1c', card: '#141a32', rail: '#0e1226', text: '#ebf0ff', muted: '#96a0be', border: '#4b5f96', button: 'linear-gradient(135deg,#818cf8,#a78bfa)' },
    },
    'canvas': {
        moodAr: 'تحريري أنيق',
        moodEn: 'Editorial canvas',
        light: { primary: '#1e3a8a', accent: '#92400e', bg: '#faf9f6', card: '#ffffff', rail: '#faf9f6', text: '#1a1917', muted: '#787164', border: '#e8e2d6', button: '#1e3a8a' },
        dark: { primary: '#d9b36a', accent: '#d6a35c', bg: '#14110d', card: '#1e1a16', rail: '#181410', text: '#f8f3e8', muted: '#b2a28a', border: '#3e372d', button: '#b98a3e' },
    },
    'fluent-pro': {
        moodAr: 'ويندوز منضبط',
        moodEn: 'Fluent enterprise',
        light: { primary: '#0078d4', accent: '#0078d4', bg: '#f3f3f3', card: '#ffffff', rail: '#f9f9f9', text: '#1b1b1b', muted: '#606060', border: '#ededed', button: '#0078d4' },
        dark: { primary: '#4cc2ff', accent: '#4cc2ff', bg: '#202020', card: '#2c2c2c', rail: '#242424', text: '#ffffff', muted: '#a0a0a0', border: '#3c3c3c', button: '#4cc2ff' },
    },
    'material-x': {
        moodAr: 'معبّر نابض',
        moodEn: 'Expressive tonal',
        light: { primary: '#7c3aed', accent: '#db2777', bg: '#f3f0fd', card: '#ffffff', rail: '#eee9fa', text: '#281950', muted: '#7d73a0', border: '#ded4f6', button: 'linear-gradient(135deg,#7c3aed,#db2777)' },
        dark: { primary: '#c4b5fd', accent: '#f9a8d4', bg: '#130c22', card: '#1e1436', rail: '#170f2a', text: '#f3eeff', muted: '#afa2cd', border: '#463273', button: 'linear-gradient(135deg,#8b5cf6,#ec4899)' },
    },
    'obsidian': {
        moodAr: 'تنفيذي داكن',
        moodEn: 'Executive dark',
        light: { primary: '#4f46e5', accent: '#4f46e5', bg: '#f4f4f5', card: '#ffffff', rail: '#fafafa', text: '#18181b', muted: '#71717a', border: '#e4e4e7', button: '#4f46e5' },
        dark: { primary: '#5e6ad2', accent: '#5e6ad2', bg: '#08090a', card: '#0f1011', rail: '#0b0c0d', text: '#f7f8f8', muted: '#8a8f98', border: '#23252a', button: '#5e6ad2' },
    },
    'tiles': {
        moodAr: 'مساحة بنتو',
        moodEn: 'Bento workspace',
        light: { primary: '#2563eb', accent: '#0891b2', bg: '#f7f8fa', card: '#ffffff', rail: '#ffffff', text: '#111827', muted: '#6b7280', border: '#e5e7eb', button: 'linear-gradient(135deg,#2563eb,#4f46e5)' },
        dark: { primary: '#60a5fa', accent: '#22d3ee', bg: '#0d1016', card: '#141922', rail: '#0f131b', text: '#f0f4fa', muted: '#8c98ac', border: '#28303e', button: 'linear-gradient(135deg,#3b82f6,#6366f1)' },
    },
    'acrylic': {
        moodAr: 'أكريليك ناعم',
        moodEn: 'Soft acrylic',
        light: { primary: '#4755ab', accent: '#0d9488', bg: '#f2f4f8', card: '#ffffff', rail: '#f8fafd', text: '#1e2337', muted: '#6e768c', border: '#e2e6f0', button: 'linear-gradient(135deg,#4755ab,#5b5fc7)' },
        dark: { primary: '#a5b4fc', accent: '#2dd4bf', bg: '#12141c', card: '#1c1f2a', rail: '#161822', text: '#eef2fa', muted: '#969eb4', border: '#343a4c', button: 'linear-gradient(135deg,#6d7fd4,#818cf8)' },
    },
    'touch': {
        moodAr: 'لمس وكاشير',
        moodEn: 'Touch POS',
        light: { primary: '#ea580c', accent: '#d97706', bg: '#f8f7f4', card: '#ffffff', rail: '#ffffff', text: '#1c1917', muted: '#78716c', border: '#e7e5e4', button: '#ea580c' },
        dark: { primary: '#fb923c', accent: '#fbbf24', bg: '#14100c', card: '#201a14', rail: '#181310', text: '#faf4ec', muted: '#b9a896', border: '#44382c', button: '#ea580c' },
    },
};

const WALLPAPERS = [
    { key: 'ember', ar: 'جمر', en: 'Ember' },
    { key: 'saffron', ar: 'زعفران', en: 'Saffron' },
    { key: 'dune', ar: 'كثبان', en: 'Dune' },
    { key: 'matcha', ar: 'ماتشا', en: 'Matcha' },
    { key: 'rose', ar: 'ورد', en: 'Rose' },
    { key: 'abyss', ar: 'لجة', en: 'Abyss' },
    { key: 'porcelain', ar: 'بورسلين', en: 'Porcelain' },
    { key: 'cocoa', ar: 'كاكاو', en: 'Cocoa' },
    { key: 'neon', ar: 'نيون', en: 'Neon' },
    { key: 'olive', ar: 'زيتون', en: 'Olive' },
] as const;

const ThemePreview = memo(function ThemePreview({
    theme,
    isActive,
    isDark,
}: {
    theme: ThemeConfig;
    isActive: boolean;
    isDark: boolean;
}) {
    const preview = THEME_PREVIEW[theme.id] ?? THEME_PREVIEW['meridian'];
    const p = isDark ? preview.dark : preview.light;
    const isFlat = theme.components.card.variant === 'flat';
    const radius = theme.shape.radiusLg;

    const modes = [
        { key: 'light' as const, p: preview.light, label: 'LIGHT' },
        { key: 'dark' as const, p: preview.dark, label: 'DARK' },
    ];

    return (
        <div
            className="relative h-28 overflow-hidden border"
            style={{ borderColor: p.border, borderRadius: radius, boxShadow: isFlat ? 'none' : '0 12px 30px rgba(15,23,42,.10)' }}
        >
            <div className="grid h-full grid-cols-2">
                {modes.map((m) => (
                    <div key={m.key} className="relative overflow-hidden" style={{ background: m.p.bg }}>
                        <div className="absolute inset-y-0 right-0 w-7" style={{ background: m.p.rail, borderLeft: `1px solid ${m.p.border}` }} />
                        <div className="absolute right-2 top-2 h-3.5 w-3.5 rounded-md" style={{ background: m.p.button }} />
                        <div className="absolute left-2 right-9 top-2 flex items-center justify-between gap-1">
                            <div className="h-2 w-12 rounded-full" style={{ background: m.p.text, opacity: 0.72 }} />
                            <div className="h-4 w-10 rounded-full" style={{ background: m.p.button }} />
                        </div>
                        <div
                            className="absolute bottom-2 left-2 right-9 h-12 border"
                            style={{ background: m.p.card, borderColor: m.p.border, borderRadius: theme.shape.radius, backdropFilter: parseInt(theme.surfaces.blur, 10) > 0 ? 'blur(14px)' : 'none' }}
                        >
                            <div className="flex h-full items-center gap-1.5 px-2">
                                <div className="h-6 w-6 rounded-lg" style={{ background: m.p.primary, opacity: 0.18 }} />
                                <div className="min-w-0 flex-1 space-y-1">
                                    <div className="h-1.5 w-3/4 rounded-full" style={{ background: m.p.text, opacity: 0.55 }} />
                                    <div className="h-1 w-1/2 rounded-full" style={{ background: m.p.muted, opacity: 0.35 }} />
                                </div>
                                <div className="h-6 w-1 rounded-full" style={{ background: m.p.accent }} />
                            </div>
                        </div>
                        <span className="absolute bottom-1 left-1 rounded px-1 text-[8px] font-black tracking-widest" style={{ background: 'rgba(0,0,0,0.35)', color: '#fff' }}>
                            {m.label}
                        </span>
                    </div>
                ))}
            </div>

            {isActive && (
                <div className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-white shadow-sm" style={{ background: p.primary }}>
                    <Check size={13} strokeWidth={3} />
                </div>
            )}
        </div>
    );
});

const ThemeCard = memo(function ThemeCard({
    theme,
    isActive,
    isDark,
    isArabic,
    onSelect,
}: {
    theme: ThemeConfig;
    isActive: boolean;
    isDark: boolean;
    isArabic: boolean;
    onSelect: (id: AppTheme) => void;
}) {
    const preview = THEME_PREVIEW[theme.id] ?? THEME_PREVIEW['meridian'];
    const p = isDark ? preview.dark : preview.light;
    const profile = MOTION_PROFILES[theme.id];
    const dirRef = useDirectionHover<HTMLDivElement>(!!profile?.directionAware);
    const tiltRef = useTilt<HTMLDivElement>((profile?.tiltMax ?? 0) > 0, profile?.tiltMax ?? 0);

    return (
        <button
            type="button"
            onClick={() => onSelect(theme.id)}
            className={`group rounded-2xl border p-2 text-start transition-[border-color,box-shadow,transform,background] duration-150 active:scale-[0.99] ${
                isActive ? 'border-primary bg-primary/5 shadow-[0_0_0_3px_rgba(var(--primary),0.10)]' : 'border-border/20 bg-card/45 hover:border-primary/30 hover:bg-card/70'
            }`}
        >
            <div ref={tiltRef}>
                <div ref={dirRef} className="dirfx dirfx-parent">
                    <ThemePreview theme={theme} isActive={isActive} isDark={isDark} />
                    <div className="dirfx-veil" aria-hidden="true">
                        <span className="text-sm font-black">{theme.name}</span>
                    </div>
                </div>
            </div>
            <div className="flex items-start justify-between gap-2 px-1.5 pt-2">
                <div className="min-w-0">
                    <h4 className="truncate text-sm font-black text-main">{theme.name}</h4>
                    <p className="mt-0.5 truncate text-[11px] font-bold text-muted">{isArabic ? preview.moodAr : preview.moodEn}</p>
                </div>
                <span className="mt-1 h-3 w-3 shrink-0 rounded-full border border-white/40 shadow-sm" style={{ background: p.primary }} />
            </div>
        </button>
    );
});

const ToggleButton = ({
    active,
    icon,
    label,
    onClick,
}: {
    active: boolean;
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
}) => (
    <button
        type="button"
        onClick={onClick}
        className={`flex h-10 items-center justify-center gap-2 rounded-xl px-3 text-xs font-black transition-colors ${
            active ? 'bg-primary text-white shadow-sm' : 'text-muted hover:bg-elevated/60 hover:text-main'
        }`}
    >
        {icon}
        {label}
    </button>
);

interface AppearanceModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const AppearanceModal: React.FC<AppearanceModalProps> = ({ isOpen, onClose }) => {
    const { settings, updateSettings } = useAuthStore();
    const isArabic = settings.language === 'ar';
    const isDark = settings.isDarkMode;

    const activeConfig = useMemo(
        () => THEME_LIST.find((theme) => theme.id === settings.theme) ?? THEME_LIST[0],
        [settings.theme],
    );

    const activePreview = THEME_PREVIEW[activeConfig.id] ?? THEME_PREVIEW['meridian'];

    const handleThemeSelect = useCallback(
        (id: AppTheme) => {
            if (id !== settings.theme) updateSettings({ theme: id });
        },
        [settings.theme, updateSettings],
    );

    const handleCustomWallpaper = useCallback(
        (event: React.ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = () => {
                updateSettings({
                    wallpaper: 'custom',
                    customWallpaperUrl: reader.result as string,
                    wallpaperOpacity: settings.wallpaperOpacity || 0.15,
                });
            };
            reader.readAsDataURL(file);
            event.target.value = '';
        },
        [settings.wallpaperOpacity, updateSettings],
    );

    // ── Theme Studio: live-preview-with-rollback ──
    // Theme clicks apply instantly as a preview; Cancel restores this snapshot.
    const [snapshot, setSnapshot] = useState<Record<string, any> | null>(null);
    const [presetName, setPresetName] = useState('');
    const [presets, setPresets] = useState<ThemePreset[]>([]);
    useEffect(() => {
        if (isOpen) {
            setSnapshot({
                theme: settings.theme, isDarkMode: settings.isDarkMode, density: settings.density,
                motionLevel: settings.motionLevel, colorOverrides: settings.colorOverrides,
                backgroundConfig: settings.backgroundConfig, wallpaper: settings.wallpaper,
                wallpaperOpacity: settings.wallpaperOpacity, customWallpaperUrl: settings.customWallpaperUrl,
            });
            setPresets(listPresets([...V2_THEME_IDS]));
            setPresetName('');
        }
    }, [isOpen]);

    const themeCount = useCountUp(THEME_LIST.length);

    const cancelStudio = useCallback(() => {
        if (snapshot) updateSettings({ ...snapshot });
        onClose();
    }, [snapshot, updateSettings, onClose]);

    const resetStudio = useCallback(() => {
        updateSettings({
            theme: 'meridian' as AppTheme, density: 'comfortable', motionLevel: 'full',
            colorOverrides: {}, backgroundConfig: { type: 'theme-native' },
            wallpaper: 'none', wallpaperOpacity: 0.15, customWallpaperUrl: '',
        });
    }, [updateSettings]);

    const setColor = useCallback((key: 'primary' | 'secondary' | 'accent', value: string) => {
        const current = sanitizeColorOverrides(settings.colorOverrides);
        if (!value) delete current[key];
        else {
            const clean = sanitizeColorOverrides({ [key]: value });
            if (clean[key]) current[key] = clean[key];
            else return;
        }
        updateSettings({ colorOverrides: current });
    }, [settings.colorOverrides, updateSettings]);

    const colorWarnings = useMemo(
        () => resolveUserOverrides(sanitizeColorOverrides(settings.colorOverrides), isDark).warnings,
        [settings.colorOverrides, isDark],
    );

    const bgConfig = useMemo(
        () => sanitizeBackgroundConfig(settings.backgroundConfig),
        [settings.backgroundConfig],
    );

    const setBg = useCallback((patch: Partial<BackgroundConfig>) => {
        updateSettings({ backgroundConfig: sanitizeBackgroundConfig({ ...bgConfig, ...patch }) });
    }, [bgConfig, updateSettings]);

    const saveCurrentPreset = useCallback(() => {
        const saved = savePreset({
            id: `preset-${Date.now()}`,
            name: presetName.trim() || `${activeConfig.name} ${isDark ? 'Dark' : 'Light'}`,
            themeId: settings.theme, mode: isDark ? 'dark' : 'light',
            density: settings.density || 'comfortable', motionLevel: settings.motionLevel || 'full',
            colorOverrides: sanitizeColorOverrides(settings.colorOverrides),
            background: bgConfig,
        }, [...V2_THEME_IDS]);
        if (saved) {
            setPresets(listPresets([...V2_THEME_IDS]));
            setPresetName('');
        }
    }, [presetName, activeConfig.name, isDark, settings, bgConfig]);

    const applyPreset = useCallback((preset: ThemePreset) => {
        updateSettings({
            theme: preset.themeId as AppTheme, isDarkMode: preset.mode === 'dark',
            density: preset.density, motionLevel: preset.motionLevel,
            colorOverrides: preset.colorOverrides || {}, backgroundConfig: preset.background || { type: 'theme-native' },
        });
    }, [updateSettings]);

    const removePreset = useCallback((id: string) => {
        if (deletePreset(id, [...V2_THEME_IDS])) setPresets(listPresets([...V2_THEME_IDS]));
    }, []);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-5" dir={isArabic ? 'rtl' : 'ltr'}>
            <button aria-label={isArabic ? 'إغلاق' : 'Close'} className="absolute inset-0 bg-black/45" type="button" onClick={onClose} />

            <section className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-border/20 bg-card shadow-2xl">
                <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border/15 px-5 py-4 sm:px-6">
                    <div className="flex min-w-0 items-center gap-3">
                        <div
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm"
                            style={{ background: (isDark ? activePreview.dark : activePreview.light).button }}
                        >
                            <Palette size={19} />
                        </div>
                        <div className="min-w-0">
                            <h2 className="truncate text-lg font-black text-main sm:text-xl">{isArabic ? 'المظهر والثيمات' : 'Appearance'}</h2>
                            <p className="truncate text-[11px] font-bold text-muted">
                                {isArabic ? `${activeConfig.name} - ${activePreview.moodAr}` : `${activeConfig.name} - ${activePreview.moodEn}`}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/20 text-muted transition-colors hover:bg-elevated/60 hover:text-main"
                    >
                        <X size={18} />
                    </button>
                </header>

                <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
                    <div className="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1fr_1fr]">
                        <div className="grid grid-cols-2 rounded-2xl border border-border/20 bg-elevated/30 p-1">
                            <ToggleButton active={!isDark} icon={<Sun size={14} />} label={isArabic ? 'فاتح' : 'Light'} onClick={() => updateSettings({ isDarkMode: false })} />
                            <ToggleButton active={isDark} icon={<Moon size={14} />} label={isArabic ? 'داكن' : 'Dark'} onClick={() => updateSettings({ isDarkMode: true })} />
                        </div>

                        <button
                            type="button"
                            onClick={() => updateSettings({ isTouchMode: !settings.isTouchMode })}
                            className={`flex h-12 items-center justify-between rounded-2xl border px-4 text-sm font-black transition-colors ${
                                settings.isTouchMode ? 'border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-300' : 'border-border/20 bg-elevated/30 text-main hover:bg-elevated/60'
                            }`}
                        >
                            <span className="flex items-center gap-2">
                                <MonitorSmartphone size={16} />
                                {isArabic ? 'وضع اللمس' : 'Touch mode'}
                            </span>
                            <span className={`h-5 w-9 rounded-full p-0.5 transition-colors ${settings.isTouchMode ? 'bg-amber-500' : 'bg-border/50'}`}>
                                <span className={`block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${settings.isTouchMode ? (isArabic ? '-translate-x-4' : 'translate-x-4') : ''}`} />
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={() => updateSettings({ language: settings.language === 'en' ? 'ar' : 'en' })}
                            className="flex h-12 items-center justify-between rounded-2xl border border-border/20 bg-elevated/30 px-4 text-sm font-black text-main transition-colors hover:bg-elevated/60"
                        >
                            <span className="flex items-center gap-2">
                                <Languages size={16} />
                                {isArabic ? 'اللغة' : 'Language'}
                            </span>
                            <span className="rounded-lg bg-card px-2 py-1 text-[10px] text-muted">{isArabic ? 'العربية' : 'English'}</span>
                        </button>
                    </div>

                    <div className="mb-4 flex items-center gap-3">
                        <h3 className="text-sm font-black text-main">{isArabic ? 'وضع العرض' : 'View mode'}</h3>
                        <div className="h-px flex-1 bg-border/15" />
                    </div>

                    <div className="mb-6 grid grid-cols-2 gap-3">
                        <button
                            type="button"
                            onClick={() => updateSettings({ layoutMode: 'classic' })}
                            className={`flex items-center gap-3 rounded-2xl border p-3 text-start transition-colors ${settings.layoutMode !== 'tiles' ? 'border-primary bg-primary/10' : 'border-border/20 bg-elevated/30 hover:bg-elevated/60'}`}
                        >
                            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${settings.layoutMode !== 'tiles' ? 'bg-primary text-white' : 'bg-elevated text-muted'}`}>
                                <LayoutDashboard size={18} />
                            </span>
                            <span className="min-w-0">
                                <span className="block text-sm font-black text-main">{isArabic ? 'الكلاسيكي' : 'Classic'}</span>
                                <span className="block truncate text-[11px] font-bold text-muted">{isArabic ? 'قائمة جانبية' : 'Sidebar workspace'}</span>
                            </span>
                        </button>
                        <button
                            type="button"
                            onClick={() => updateSettings({ layoutMode: 'tiles' })}
                            className={`flex items-center gap-3 rounded-2xl border p-3 text-start transition-colors ${settings.layoutMode === 'tiles' ? 'border-primary bg-primary/10' : 'border-border/20 bg-elevated/30 hover:bg-elevated/60'}`}
                        >
                            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${settings.layoutMode === 'tiles' ? 'bg-primary text-white' : 'bg-elevated text-muted'}`}>
                                <LayoutGrid size={18} />
                            </span>
                            <span className="min-w-0">
                                <span className="block text-sm font-black text-main">{isArabic ? 'بلاطات 3D' : 'Tiles 3D'}</span>
                                <span className="block truncate text-[11px] font-bold text-muted">{isArabic ? 'شاشة ذكية تفاعلية' : 'Smart 3D launcher'}</span>
                            </span>
                        </button>
                    </div>

                    <div className="mb-4 flex items-center gap-3">
                        <h3 className="text-sm font-black text-main">{isArabic ? 'الثيمات' : 'Themes'}</h3>
                        <div className="h-px flex-1 bg-border/15" />
                        <span className="text-[10px] font-black text-muted">{themeCount}</span>
                    </div>

                    <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                        {THEME_LIST.map((theme) => (
                            <ThemeCard
                                key={theme.id}
                                theme={theme}
                                isActive={settings.theme === theme.id}
                                isDark={isDark}
                                isArabic={isArabic}
                                onSelect={handleThemeSelect}
                            />
                        ))}
                    </div>

                    <div className="mb-4 flex items-center gap-3">
                        <h3 className="flex items-center gap-2 text-sm font-black text-main"><Pipette size={14} /> {isArabic ? 'تخصيص' : 'Customize'}</h3>
                        <div className="h-px flex-1 bg-border/15" />
                        <button type="button" onClick={resetStudio} className="flex items-center gap-1 rounded-lg border border-border/20 px-2.5 py-1.5 text-[11px] font-black text-muted transition-colors hover:text-main">
                            <RotateCcw size={12} /> {isArabic ? 'استعادة الافتراضي' : 'Reset'}
                        </button>
                    </div>

                    <div className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-3">
                        <div className="rounded-2xl border border-border/20 bg-elevated/30 p-4">
                            <div className="mb-3 text-xs font-black text-main">{isArabic ? 'ألوان العلامة' : 'Brand colors'}</div>
                            {(['primary', 'secondary', 'accent'] as const).map((key) => (
                                <label key={key} className="mb-2 flex items-center gap-2 text-xs font-bold text-muted">
                                    <input
                                        type="color"
                                        value={sanitizeColorOverrides(settings.colorOverrides)[key] || '#6366f1'}
                                        onChange={(e) => setColor(key, e.target.value)}
                                        className="h-8 w-10 cursor-pointer rounded-lg border border-border/30 bg-card"
                                    />
                                    <span className="w-20 capitalize">{key}</span>
                                    <input
                                        type="text"
                                        value={sanitizeColorOverrides(settings.colorOverrides)[key] || ''}
                                        placeholder={isArabic ? 'تلقائي' : 'Auto'}
                                        onChange={(e) => setColor(key, e.target.value.trim())}
                                        className="h-8 w-24 rounded-lg border border-border/30 bg-card px-2 font-mono text-[11px] text-main outline-none"
                                        dir="ltr"
                                    />
                                </label>
                            ))}
                            {colorWarnings.map((w) => (
                                <div key={w} className="mt-2 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-bold text-amber-600 dark:text-amber-300">{w}</div>
                            ))}
                        </div>

                        <div className="rounded-2xl border border-border/20 bg-elevated/30 p-4">
                            <div className="mb-3 flex items-center gap-2 text-xs font-black text-main"><Layers size={13} /> {isArabic ? 'الكثافة' : 'Density'}</div>
                            <div className="grid grid-cols-3 gap-1.5">
                                {(['compact', 'comfortable', 'spacious'] as const).map((d) => (
                                    <button
                                        key={d}
                                        type="button"
                                        onClick={() => updateSettings({ density: d })}
                                        className={`rounded-xl px-2 py-2.5 text-[11px] font-black transition-colors ${(settings.density || 'comfortable') === d ? 'bg-primary text-white' : 'bg-card text-muted hover:text-main'}`}
                                    >
                                        {isArabic ? (d === 'compact' ? 'مدمج' : d === 'comfortable' ? 'مريح' : 'رحب') : d}
                                    </button>
                                ))}
                            </div>
                            <div className="mb-3 mt-4 flex items-center gap-2 text-xs font-black text-main"><Gauge size={13} /> {isArabic ? 'الحركة' : 'Motion'}</div>
                            <div className="grid grid-cols-3 gap-1.5">
                                {(['full', 'reduced', 'off'] as const).map((m) => (
                                    <button
                                        key={m}
                                        type="button"
                                        onClick={() => updateSettings({ motionLevel: m })}
                                        className={`rounded-xl px-2 py-2.5 text-[11px] font-black transition-colors ${(settings.motionLevel || 'full') === m ? 'bg-primary text-white' : 'bg-card text-muted hover:text-main'}`}
                                    >
                                        {isArabic ? (m === 'full' ? 'كاملة' : m === 'reduced' ? 'هادئة' : 'إيقاف') : m}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-border/20 bg-elevated/30 p-4">
                            <div className="mb-3 text-xs font-black text-main">{isArabic ? 'خلفية المحرك' : 'Engine background'}</div>
                            <select
                                value={bgConfig.type}
                                onChange={(e) => setBg({ type: e.target.value as BgType })}
                                className="mb-2 h-9 w-full rounded-lg border border-border/30 bg-card px-2 text-xs font-bold text-main outline-none"
                            >
                                {(['theme-native', 'solid', 'linear', 'radial', 'mesh', 'aurora', 'noise', 'dots', 'grid', 'geometric', 'ambient', 'gradient-texture'] as BgType[]).map((t) => (
                                    <option key={t} value={t}>{t}</option>
                                ))}
                            </select>
                            {bgConfig.type !== 'theme-native' && (
                                <div className="flex items-center gap-2">
                                    <span className="text-[11px] font-black text-muted">{isArabic ? 'القوة' : 'Intensity'}</span>
                                    <input
                                        type="range" min="0.1" max="1" step="0.05"
                                        value={bgConfig.intensity ?? 0.5}
                                        onChange={(e) => setBg({ intensity: parseFloat(e.target.value) })}
                                        className="h-1.5 flex-1 cursor-pointer accent-[rgb(var(--primary))]"
                                    />
                                </div>
                            )}
                            {(bgConfig.type === 'aurora' || bgConfig.type === 'mesh') && (
                                <div className="mt-2 grid grid-cols-3 gap-1.5">
                                    {(['off', 'slow', 'normal'] as const).map((s) => (
                                        <button
                                            key={s}
                                            type="button"
                                            onClick={() => setBg({ speed: s })}
                                            className={`rounded-lg px-2 py-1.5 text-[11px] font-black ${(bgConfig.speed || 'off') === s ? 'bg-primary text-white' : 'bg-card text-muted'}`}
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <div className="mt-2 text-[10px] font-bold text-muted">{isArabic ? 'صورة الخلفية المرفوعة تبقى لها الأولوية دائماً.' : 'An uploaded wallpaper image always takes precedence.'}</div>
                        </div>
                    </div>

                    <div className="mb-4 flex items-center gap-3">
                        <h3 className="flex items-center gap-2 text-sm font-black text-main"><Save size={14} /> {isArabic ? 'إعدادات محفوظة' : 'Presets'}</h3>
                        <div className="h-px flex-1 bg-border/15" />
                    </div>

                    <div className="mb-6 rounded-2xl border border-border/20 bg-elevated/30 p-4">
                        <div className="mb-3 flex gap-2">
                            <input
                                value={presetName}
                                onChange={(e) => setPresetName(e.target.value)}
                                placeholder={isArabic ? 'اسم الإعداد (مثال: وردية الليل)' : 'Preset name (e.g. Night shift)'}
                                className="h-10 min-w-0 flex-1 rounded-xl border border-border/30 bg-card px-3 text-xs font-bold text-main outline-none"
                            />
                            <button type="button" onClick={saveCurrentPreset} className="flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-xs font-black text-white">
                                <Save size={14} /> {isArabic ? 'حفظ الحالي' : 'Save current'}
                            </button>
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {presets.map((preset) => (
                                <div key={preset.id} className="flex items-center gap-2 rounded-xl border border-border/20 bg-card p-2.5">
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-xs font-black text-main">{preset.name}</div>
                                        <div className="truncate text-[10px] font-bold text-muted">{preset.themeId} · {preset.mode} · {preset.density}{preset.builtIn ? ' · built-in' : ''}</div>
                                    </div>
                                    <button type="button" onClick={() => applyPreset(preset)} className="rounded-lg bg-primary/10 px-2.5 py-1.5 text-[11px] font-black text-primary">{isArabic ? 'تطبيق' : 'Apply'}</button>
                                    {!preset.builtIn && (
                                        <button type="button" onClick={() => removePreset(preset.id)} className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-500/10" aria-label="Delete preset">
                                            <Trash2 size={13} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="mb-4 flex items-center gap-3">
                        <h3 className="text-sm font-black text-main">{isArabic ? 'خلفية المساحة' : 'Workspace Wallpaper'}</h3>
                        <div className="h-px flex-1 bg-border/15" />
                    </div>

                    <div className="mb-4 grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-6">
                        <button
                            type="button"
                            onClick={() => updateSettings({ wallpaper: 'none' })}
                            className={`relative flex aspect-[16/10] items-center justify-center rounded-2xl border text-[10px] font-black transition-colors ${
                                !settings.wallpaper || settings.wallpaper === 'none' ? 'border-primary bg-primary/10 text-primary' : 'border-border/20 bg-elevated/30 text-muted hover:bg-elevated/60'
                            }`}
                        >
                            {isArabic ? 'بدون' : 'None'}
                            {(!settings.wallpaper || settings.wallpaper === 'none') && <Check className="absolute left-2 top-2" size={13} />}
                        </button>

                        {WALLPAPERS.map((wallpaper) => {
                            const isActive = settings.wallpaper === wallpaper.key;
                            return (
                                <button
                                    key={wallpaper.key}
                                    type="button"
                                    onClick={() => updateSettings({ wallpaper: wallpaper.key, wallpaperOpacity: settings.wallpaperOpacity || 0.15 })}
                                    className={`relative aspect-[16/10] overflow-hidden rounded-2xl border transition-[border-color,transform] duration-150 active:scale-[0.99] ${
                                        isActive ? 'border-primary shadow-[0_0_0_3px_rgba(var(--primary),0.10)]' : 'border-border/20 hover:border-primary/30'
                                    }`}
                                >
                                    <img src={`/wallpapers/${wallpaper.key}.png`} alt={isArabic ? wallpaper.ar : wallpaper.en} className="h-full w-full object-cover" loading="lazy" />
                                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent px-2 pb-1.5 pt-5 text-[9px] font-black text-white">
                                        {isArabic ? wallpaper.ar : wallpaper.en}
                                    </span>
                                    {isActive && (
                                        <span className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
                                            <Check size={11} strokeWidth={3} />
                                        </span>
                                    )}
                                </button>
                            );
                        })}

                        {settings.wallpaper === 'custom' && settings.customWallpaperUrl ? (
                            <div className="relative aspect-[16/10] overflow-hidden rounded-2xl border border-primary">
                                <img src={settings.customWallpaperUrl} alt={isArabic ? 'خلفية مخصصة' : 'Custom wallpaper'} className="h-full w-full object-cover" />
                                <button
                                    type="button"
                                    onClick={() => updateSettings({ wallpaper: 'none', customWallpaperUrl: '' })}
                                    className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-danger text-white"
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        ) : (
                            <label className="flex aspect-[16/10] cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-border/30 bg-elevated/30 text-[10px] font-black text-muted transition-colors hover:border-primary/40 hover:text-primary">
                                <ImagePlus size={18} />
                                {isArabic ? 'رفع' : 'Upload'}
                                <input type="file" accept="image/*" className="hidden" onChange={handleCustomWallpaper} />
                            </label>
                        )}
                    </div>

                    {settings.wallpaper && settings.wallpaper !== 'none' && (
                        <div className="flex items-center gap-3 rounded-2xl border border-border/15 bg-elevated/30 px-4 py-3">
                            <span className="text-[11px] font-black text-muted">{isArabic ? 'الظهور' : 'Intensity'}</span>
                            <input
                                type="range"
                                min="0.05"
                                max="0.5"
                                step="0.01"
                                value={settings.wallpaperOpacity ?? 0.15}
                                onChange={(event) => updateSettings({ wallpaperOpacity: parseFloat(event.target.value) })}
                                className="h-1.5 flex-1 cursor-pointer accent-[rgb(var(--primary))]"
                            />
                            <span className="w-10 text-center text-[11px] font-black text-primary">{Math.round((settings.wallpaperOpacity ?? 0.15) * 100)}%</span>
                        </div>
                    )}
                </div>

                <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border/15 bg-elevated/30 px-5 py-3.5 sm:px-6">
                    <span className="hidden text-[11px] font-bold text-muted sm:block">
                        {isArabic ? 'المعاينة حية — إلغاء يعيد كل شيء كما كان.' : 'Live preview — Cancel restores everything.'}
                    </span>
                    <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
                        <button type="button" onClick={cancelStudio} className="h-10 rounded-xl border border-border/25 px-5 text-xs font-black text-muted transition-colors hover:text-main">
                            {isArabic ? 'إلغاء' : 'Cancel'}
                        </button>
                        <button type="button" onClick={onClose} className="h-10 rounded-xl bg-primary px-6 text-xs font-black text-white shadow-sm">
                            {isArabic ? 'تم' : 'Done'}
                        </button>
                    </div>
                </footer>
            </section>
        </div>
    );
};

export default AppearanceModal;
