import React, { memo, useCallback, useMemo } from 'react';
import {
    Check,
    ImagePlus,
    Languages,
    MonitorSmartphone,
    Moon,
    Palette,
    Sun,
    Trash2,
    X,
} from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
import { THEME_LIST, type ThemeConfig } from '../../theme/tokens';
import type { AppTheme } from '../../types';

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
    'mica-glass': {
        moodAr: 'زجاج iOS',
        moodEn: 'Liquid glass',
        light: { primary: '#2563eb', accent: '#06b6d4', bg: '#e8f0f7', card: 'rgba(255,255,255,.68)', rail: 'rgba(248,251,253,.72)', text: '#0f172a', muted: '#64748b', border: 'rgba(148,163,184,.38)', button: 'linear-gradient(135deg,#2563eb,#06b6d4)' },
        dark: { primary: '#60a5fa', accent: '#22d3ee', bg: '#07111f', card: 'rgba(18,25,40,.78)', rail: 'rgba(14,20,34,.82)', text: '#f1f5f9', muted: '#94a3b8', border: 'rgba(96,165,250,.18)', button: 'linear-gradient(135deg,#60a5fa,#22d3ee)' },
    },
    'fluent-clean': {
        moodAr: 'واضح ومهني',
        moodEn: 'Clean Windows',
        light: { primary: '#0067c0', accent: '#107cd8', bg: '#f3f7fb', card: '#ffffff', rail: '#f5f8fb', text: '#191f28', muted: '#606c7c', border: '#dae0e8', button: '#0067c0' },
        dark: { primary: '#60c2ff', accent: '#7dd3fc', bg: '#111822', card: '#192230', rail: '#141d2a', text: '#f5f7fa', muted: '#a2aec1', border: '#374456', button: '#60c2ff' },
    },
    'material-soft': {
        moodAr: 'ناعم ومرن',
        moodEn: 'Soft material',
        light: { primary: '#544fc5', accent: '#0ea5e9', bg: '#fbf7ff', card: '#ffffff', rail: '#f4efff', text: '#1f1f28', muted: '#696774', border: '#e2dfec', button: 'linear-gradient(135deg,#544fc5,#0ea5e9)' },
        dark: { primary: '#a78bfa', accent: '#38bdf8', bg: '#11101c', card: '#1b192a', rail: '#161524', text: '#f5f3ff', muted: '#afabc3', border: '#413c58', button: 'linear-gradient(135deg,#a78bfa,#38bdf8)' },
    },
    'neumorphism-soft': {
        moodAr: 'ملموس وودود',
        moodEn: 'Tactile soft',
        light: { primary: '#0e7490', accent: '#059669', bg: '#e8eff1', card: '#eef4f6', rail: '#e4ecef', text: '#1e292d', muted: '#5b6e76', border: '#cddade', button: 'linear-gradient(145deg,#0e7490,#059669)' },
        dark: { primary: '#2dd4bf', accent: '#34d399', bg: '#141d21', card: '#1c272c', rail: '#182227', text: '#ecfdf5', muted: '#97abb1', border: '#374b52', button: 'linear-gradient(145deg,#2dd4bf,#34d399)' },
    },
    'flat-minimal': {
        moodAr: 'مسطح وسريع',
        moodEn: 'Flat minimal',
        light: { primary: '#115e59', accent: '#2563eb', bg: '#fafafa', card: '#ffffff', rail: '#ffffff', text: '#18181b', muted: '#71717a', border: '#e4e4e7', button: '#115e59' },
        dark: { primary: '#2dd4bf', accent: '#60a5fa', bg: '#121214', card: '#1b1b1e', rail: '#17171a', text: '#f4f4f5', muted: '#a1a1aa', border: '#3f3f46', button: '#2dd4bf' },
    },
    'fintech-sharp': {
        moodAr: 'دقيق وكثيف',
        moodEn: 'Sharp finance',
        light: { primary: '#0284c7', accent: '#0d9488', bg: '#f6f8fb', card: '#ffffff', rail: '#eef4f8', text: '#0f172a', muted: '#64748b', border: '#cbd5e1', button: 'linear-gradient(135deg,#0284c7,#0d9488)' },
        dark: { primary: '#38bdf8', accent: '#2dd4bf', bg: '#080d17', card: '#0f172a', rail: '#0b1220', text: '#f1f5f9', muted: '#94a3b8', border: '#334155', button: 'linear-gradient(135deg,#38bdf8,#2dd4bf)' },
    },
    'cupertino-light': {
        moodAr: 'مصقول وخفيف',
        moodEn: 'Polished Apple',
        light: { primary: '#007aff', accent: '#34c759', bg: '#f2f2f7', card: 'rgba(255,255,255,.88)', rail: 'rgba(249,249,251,.84)', text: '#1c1c1e', muted: '#6f6f75', border: '#d1d1d6', button: 'linear-gradient(180deg,#0a84ff,#007aff)' },
        dark: { primary: '#0a84ff', accent: '#30d158', bg: '#121214', card: 'rgba(28,28,30,.9)', rail: 'rgba(24,24,26,.86)', text: '#f2f2f7', muted: '#aeaeb2', border: '#3a3a3c', button: 'linear-gradient(180deg,#409cff,#0a84ff)' },
    },
    'monochrome-pro': {
        moodAr: 'جرافيت صارم',
        moodEn: 'Graphite pro',
        light: { primary: '#27272a', accent: '#0e7490', bg: '#f7f7f8', card: '#ffffff', rail: '#fcfcfd', text: '#18181b', muted: '#52525b', border: '#d4d4d8', button: '#27272a' },
        dark: { primary: '#f4f4f5', accent: '#67e8f9', bg: '#09090b', card: '#121214', rail: '#0e0e10', text: '#fafafa', muted: '#a1a1aa', border: '#3f3f46', button: '#f4f4f5' },
    },
    'warm-beige': {
        moodAr: 'دافئ ومريح',
        moodEn: 'Warm workspace',
        light: { primary: '#92400e', accent: '#0d9488', bg: '#f8f2e8', card: '#fffaf3', rail: '#f3e7d6', text: '#2f231c', muted: '#78604d', border: '#e2d6c7', button: 'linear-gradient(135deg,#92400e,#0d9488)' },
        dark: { primary: '#fb923c', accent: '#2dd4bf', bg: '#1b1612', card: '#261f1a', rail: '#201a16', text: '#fff7ed', muted: '#cab8a6', border: '#524438', button: 'linear-gradient(135deg,#fb923c,#2dd4bf)' },
    },
    'dark-elegant': {
        moodAr: 'تنفيذي وفخم',
        moodEn: 'Executive',
        light: { primary: '#4f46e5', accent: '#0f766e', bg: '#f4f6f9', card: '#ffffff', rail: '#eef2f7', text: '#0f172a', muted: '#475569', border: '#cbd5e1', button: 'linear-gradient(135deg,#111827,#4f46e5)' },
        dark: { primary: '#818cf8', accent: '#2dd4bf', bg: '#05080f', card: '#0d121e', rail: '#090d17', text: '#f8fafc', muted: '#94a3b8', border: '#1e293b', button: 'linear-gradient(135deg,#818cf8,#2dd4bf)' },
    },
};

const WALLPAPERS = [
    { key: 'aurora', ar: 'شفق', en: 'Aurora' },
    { key: 'nebula', ar: 'سديم', en: 'Nebula' },
    { key: 'mesh', ar: 'شبكة', en: 'Mesh' },
    { key: 'mountain', ar: 'جبال', en: 'Mountain' },
    { key: 'ocean', ar: 'محيط', en: 'Ocean' },
    { key: 'abstract', ar: 'تجريدي', en: 'Abstract' },
    { key: 'glass', ar: 'زجاج', en: 'Glass' },
    { key: 'forest', ar: 'غابة', en: 'Forest' },
    { key: 'marble', ar: 'رخام', en: 'Marble' },
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
    const preview = THEME_PREVIEW[theme.id] ?? THEME_PREVIEW['mica-glass'];
    const p = isDark ? preview.dark : preview.light;
    const isFlat = theme.components.card.variant === 'flat';
    const radius = theme.shape.radiusLg;

    return (
        <div
            className="relative h-24 overflow-hidden border"
            style={{
                background: p.bg,
                borderColor: p.border,
                borderRadius: radius,
                boxShadow: isFlat ? 'none' : '0 12px 30px rgba(15,23,42,.10)',
            }}
        >
            <div className="absolute inset-y-0 right-0 w-10" style={{ background: p.rail, borderLeft: `1px solid ${p.border}` }} />
            <div className="absolute right-3 top-3 h-4 w-4 rounded-md" style={{ background: p.button }} />
            <div className="absolute right-3 top-10 h-2 w-5 rounded-full" style={{ background: p.primary, opacity: 0.35 }} />
            <div className="absolute right-3 top-16 h-2 w-4 rounded-full" style={{ background: p.muted, opacity: 0.28 }} />

            <div className="absolute left-3 right-14 top-3 flex items-center justify-between gap-2">
                <div className="h-2.5 w-16 rounded-full" style={{ background: p.text, opacity: 0.72 }} />
                <div className="h-5 w-14 rounded-full" style={{ background: p.button }} />
            </div>

            <div
                className="absolute bottom-3 left-3 right-14 h-11 border"
                style={{
                    background: p.card,
                    borderColor: p.border,
                    borderRadius: theme.shape.radius,
                    backdropFilter: parseInt(theme.surfaces.blur, 10) > 0 ? 'blur(14px)' : 'none',
                }}
            >
                <div className="flex h-full items-center gap-2 px-3">
                    <div className="h-7 w-7 rounded-lg" style={{ background: p.primary, opacity: 0.18 }} />
                    <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="h-2 w-3/4 rounded-full" style={{ background: p.text, opacity: 0.55 }} />
                        <div className="h-1.5 w-1/2 rounded-full" style={{ background: p.muted, opacity: 0.35 }} />
                    </div>
                    <div className="h-7 w-1.5 rounded-full" style={{ background: p.accent }} />
                </div>
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
    const preview = THEME_PREVIEW[theme.id] ?? THEME_PREVIEW['mica-glass'];
    const p = isDark ? preview.dark : preview.light;

    return (
        <button
            type="button"
            onClick={() => onSelect(theme.id)}
            className={`group rounded-2xl border p-2 text-start transition-[border-color,box-shadow,transform,background] duration-150 active:scale-[0.99] ${
                isActive ? 'border-primary bg-primary/5 shadow-[0_0_0_3px_rgba(var(--primary),0.10)]' : 'border-border/20 bg-card/45 hover:border-primary/30 hover:bg-card/70'
            }`}
        >
            <ThemePreview theme={theme} isActive={isActive} isDark={isDark} />
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

    const activePreview = THEME_PREVIEW[activeConfig.id] ?? THEME_PREVIEW['mica-glass'];

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
                        <h3 className="text-sm font-black text-main">{isArabic ? 'الثيمات' : 'Themes'}</h3>
                        <div className="h-px flex-1 bg-border/15" />
                        <span className="text-[10px] font-black text-muted">{THEME_LIST.length}</span>
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
            </section>
        </div>
    );
};

export default AppearanceModal;
