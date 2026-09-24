import React, { memo, useCallback, useMemo } from 'react';
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
    'aurora-glass': {
        moodAr: 'زجاج شفاف',
        moodEn: 'Frosted aurora',
        light: { primary: '#4f46e5', accent: '#22d3ee', bg: '#eef1ff', card: '#ffffff', rail: '#f4f6ff', text: '#1e2044', muted: '#6e769b', border: '#d6dcf5', button: 'linear-gradient(135deg,#6366f1,#8b5cf6,#22d3ee)' },
        dark: { primary: '#818cf8', accent: '#67e8f9', bg: '#090b1e', card: '#131734', rail: '#0c0f26', text: '#ebf0ff', muted: '#96a0c8', border: '#3a4060', button: 'linear-gradient(135deg,#818cf8,#8b5cf6,#22d3ee)' },
    },
    'midnight-command': {
        moodAr: 'غرفة قيادة',
        moodEn: 'Razor command',
        light: { primary: '#2563eb', accent: '#2563eb', bg: '#f6f8fa', card: '#ffffff', rail: '#fafbfc', text: '#111827', muted: '#6b7280', border: '#e5e7eb', button: '#2563eb' },
        dark: { primary: '#60a5fa', accent: '#60a5fa', bg: '#090a0e', card: '#11131a', rail: '#0c0d13', text: '#f0f2f7', muted: '#8c94a8', border: '#2a2e3a', button: '#2563eb' },
    },
    'neo-brutal': {
        moodAr: 'جرأة جرافيكية',
        moodEn: 'Bold graphic',
        light: { primary: '#0f0f0f', accent: '#facc15', bg: '#fffcf2', card: '#ffffff', rail: '#fffaeb', text: '#0f0f0f', muted: '#5f5a50', border: '#0f0f0f', button: '#0f0f0f' },
        dark: { primary: '#facc15', accent: '#facc15', bg: '#0c0c0c', card: '#181818', rail: '#101010', text: '#f5f5f5', muted: '#aaaaaa', border: '#f5f5f5', button: '#facc15' },
    },
    'soft-organic': {
        moodAr: 'دفء مريح',
        moodEn: 'Warm calm',
        light: { primary: '#2e8b6d', accent: '#e8a87c', bg: '#fdf8f0', card: '#fffdf9', rail: '#faf3e9', text: '#44382c', muted: '#968470', border: '#ebdecb', button: 'linear-gradient(135deg,#2e8b6d,#3fa383)' },
        dark: { primary: '#86c8aa', accent: '#f0be96', bg: '#201c1a', card: '#2c2724', rail: '#241f1c', text: '#f5ebde', muted: '#af9e8c', border: '#4b413a', button: 'linear-gradient(135deg,#3fa383,#2e8b6d)' },
    },
    'editorial-luxury': {
        moodAr: 'فخامة ورقية',
        moodEn: 'Paper luxury',
        light: { primary: '#784820', accent: '#801e28', bg: '#faf7f2', card: '#fffefb', rail: '#f7f3ec', text: '#1c1917', muted: '#7d7060', border: '#e4dac8', button: '#1c1917' },
        dark: { primary: '#d4af69', accent: '#c8786e', bg: '#14110e', card: '#1e1a16', rail: '#181410', text: '#f0eade', muted: '#a59684', border: '#3e342a', button: '#d4af69' },
    },
    'terminal-ops': {
        moodAr: 'كونسول عمليات',
        moodEn: 'Ops console',
        light: { primary: '#008246', accent: '#00a05a', bg: '#e8ece8', card: '#f6f9f6', rail: '#e2e7e2', text: '#121e16', muted: '#5a6e5f', border: '#c3cdc4', button: '#0c2b1a' },
        dark: { primary: '#3cdc82', accent: '#3cdc82', bg: '#040c08', card: '#08140d', rail: '#040b06', text: '#c8e6d2', muted: '#6e967d', border: '#1c3726', button: '#3cdc82' },
    },
    'future-hud': {
        moodAr: 'مركز مستقبلي',
        moodEn: 'Future ops',
        light: { primary: '#0284c7', accent: '#a855f7', bg: '#e4f0fa', card: '#ffffff', rail: '#e8f3fc', text: '#0c233c', muted: '#5f7896', border: '#b9d7eb', button: 'linear-gradient(100deg,#0284c7,#0369a1,#7c3aed)' },
        dark: { primary: '#22d3ee', accent: '#e879f9', bg: '#050814', card: '#0c1226', rail: '#070b1a', text: '#dcebff', muted: '#829bbe', border: '#283c64', button: 'linear-gradient(100deg,#0891b2,#0284c7,#7c3aed)' },
    },
    'bento-saas': {
        moodAr: 'مرح جريء',
        moodEn: 'Bold playful',
        light: { primary: '#e11d48', accent: '#f59e0b', bg: '#fff5f3', card: '#ffffff', rail: '#fff0ed', text: '#2e161e', muted: '#96737d', border: '#f5d7d2', button: 'linear-gradient(135deg,#e11d48,#be1239)' },
        dark: { primary: '#fb7185', accent: '#fbbf24', bg: '#160a0e', card: '#241218', rail: '#1a0b0f', text: '#ffeef0', muted: '#b9969e', border: '#48282f', button: 'linear-gradient(135deg,#e11d48,#9f1239)' },
    },
    'industrial-ops': {
        moodAr: 'فلوينت هادئ',
        moodEn: 'Calm fluent',
        light: { primary: '#0078d4', accent: '#0078d4', bg: '#f3f3f3', card: '#ffffff', rail: '#fafafa', text: '#1b1b1b', muted: '#616161', border: '#e5e5e5', button: '#0078d4' },
        dark: { primary: '#4cc2ff', accent: '#4cc2ff', bg: '#202020', card: '#2d2d2d', rail: '#252525', text: '#ffffff', muted: '#a3a3a3', border: '#2e2e2e', button: '#0078d4' },
    },
    'premium-hospitality': {
        moodAr: 'زمردي فاخر',
        moodEn: 'Emerald luxury',
        light: { primary: '#046307', accent: '#b08d20', bg: '#f5f0e1', card: '#fffdf6', rail: '#f0e9d5', text: '#201e16', muted: '#82735a', border: '#decda5', button: 'linear-gradient(135deg,#046307,#034d06)' },
        dark: { primary: '#d4af37', accent: '#34d399', bg: '#0b120e', card: '#141e18', rail: '#0d1510', text: '#f2ecdc', muted: '#a59b82', border: '#303e32', button: 'linear-gradient(135deg,#0b5c40,#084a34)' },
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
    const preview = THEME_PREVIEW[theme.id] ?? THEME_PREVIEW['aurora-glass'];
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
    const preview = THEME_PREVIEW[theme.id] ?? THEME_PREVIEW['aurora-glass'];
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

    const activePreview = THEME_PREVIEW[activeConfig.id] ?? THEME_PREVIEW['aurora-glass'];

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
