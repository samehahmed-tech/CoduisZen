import React, { useMemo, useRef, useState } from 'react';
import { Check, Image, Moon, Palette, RotateCcw, Sparkles, Sun, Upload } from 'lucide-react';
import { THEME_LIST } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { sanitizeBackgroundConfig, type BackgroundConfig } from '../theme/engine/background';
import { useAuthStore } from '../stores/useAuthStore';

const THEME_ACCENTS: Record<string, [string, string]> = {
    meridian: ['#6366f1', '#38bdf8'], command: ['#0ea5e9', '#f59e0b'], glassline: ['#818cf8', '#22d3ee'],
    canvas: ['#1d4ed8', '#b45309'], 'fluent-pro': ['#0078d4', '#00b7c3'], 'material-x': ['#8b5cf6', '#ec4899'],
    obsidian: ['#5e6ad2', '#38bdf8'], tiles: ['#2563eb', '#0891b2'], acrylic: ['#6474c6', '#14b8a6'], touch: ['#ea580c', '#f59e0b'],
};

const BACKGROUNDS: Array<{ id: string; name: string; nameAr: string; mood: string; moodAr: string; image: string }> = [
    // These are the same four visual scenes used by the Login screen, exported
    // once to WebP so the logged-in shell and Login share one visual identity.
    { id: 'aurora', name: 'Resto Night', nameAr: 'مطعم ليلي', mood: 'Premium hospitality', moodAr: 'ضيافة فاخرة', image: '/wallpapers/webp/aurora.webp' },
    { id: 'midnight', name: 'Café Interior', nameAr: 'داخل الكافيه', mood: 'Calm focus', moodAr: 'تركيز هادئ', image: '/wallpapers/webp/midnight.webp' },
    { id: 'copper', name: 'Baklava Table', nameAr: 'طاولة البقلاوة', mood: 'Warm energy', moodAr: 'طاقة دافئة', image: '/wallpapers/webp/copper.webp' },
    { id: 'violet', name: 'Coffee Detail', nameAr: 'تفاصيل القهوة', mood: 'Creative pulse', moodAr: 'نبض إبداعي', image: '/wallpapers/webp/violet.webp' },
];

// The image itself remains crisp; readability is handled by a light surface
// overlay rather than a dark second veil over the whole scene.
const withImage = (imageUrl: string, opacity = .96): BackgroundConfig => ({ type: 'image-overlay', imageUrl, overlay: '#07111f', overlayOpacity: .08, opacity, speed: 'off' });

const ThemeLab: React.FC = () => {
    const { theme, setTheme } = useTheme();
    const { settings, updateSettings } = useAuthStore();
    const isArabic = settings.language === 'ar';
    const isDark = settings.isDarkMode;
    const [query, setQuery] = useState('');
    const [message, setMessage] = useState<string | null>(null);
    const uploadRef = useRef<HTMLInputElement>(null);
    const activeBackground = sanitizeBackgroundConfig(settings.backgroundConfig);

    const visibleThemes = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return THEME_LIST;
        return THEME_LIST.filter((item) => [item.name, item.description, ...item.tags].join(' ').toLowerCase().includes(q));
    }, [query]);

    const applyBackground = (config: BackgroundConfig) => {
        updateSettings({ backgroundConfig: sanitizeBackgroundConfig(config), wallpaper: 'none' });
        setMessage(isArabic ? 'تم تطبيق الخلفية على النظام كله' : 'Background applied across the workspace');
        window.setTimeout(() => setMessage(null), 2200);
    };

    const isActiveBackground = (imageUrl: string) => activeBackground.type === 'image-overlay' && activeBackground.imageUrl === imageUrl;

    const handleUpload = (file?: File) => {
        if (!file) return;
        if (!file.type.startsWith('image/')) { setMessage(isArabic ? 'اختار ملف صورة فقط' : 'Please choose an image file'); return; }
        if (file.size > 2_500_000) { setMessage(isArabic ? 'حجم الصورة يجب ألا يتجاوز 2.5MB' : 'Image must be smaller than 2.5MB'); return; }
        const reader = new FileReader();
        reader.onload = () => applyBackground({ type: 'image-overlay', imageUrl: String(reader.result), overlay: '#07111f', overlayOpacity: .08, opacity: .96, speed: 'off' });
        reader.readAsDataURL(file);
    };

    const activeBackgroundName = activeBackground.imageUrl?.startsWith('/wallpapers/webp/')
        ? BACKGROUNDS.find((item) => item.image === activeBackground.imageUrl)?.[isArabic ? 'nameAr' : 'name']
        : activeBackground.type === 'image-overlay' ? (isArabic ? 'صورة مخصصة' : 'Custom image') : (isArabic ? 'خلفية الثيم' : 'Theme native');

    return (
        <div className="theme-lab-simple" data-page-enter>
            <header className="theme-lab-simple-hero theme-card">
                <div className="theme-lab-brand"><Palette size={22} /></div>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-black text-main">{isArabic ? 'مركز المظهر' : 'Appearance Center'}</h1><span className="theme-manager-live-badge"><Sparkles size={11} /> {isArabic ? 'تحكم كامل بالنظام' : 'System-wide'}</span></div>
                    <p className="mt-1 text-xs font-bold text-muted">{isArabic ? 'اختار الشكل والخلفية في ثواني، وكل شيء يتطبق فورًا.' : 'Choose a look and a background in seconds. Changes apply instantly.'}</p>
                </div>
                <div className="theme-lab-mode-toggle"><button type="button" onClick={() => updateSettings({ isDarkMode: false })} className={!isDark ? 'is-active' : ''} aria-label="Light"><Sun size={16} /></button><button type="button" onClick={() => updateSettings({ isDarkMode: true })} className={isDark ? 'is-active' : ''} aria-label="Dark"><Moon size={16} /></button></div>
            </header>

            <section className="theme-card theme-lab-section">
                <div className="theme-lab-section-head"><div><h2 className="text-sm font-black text-main">{isArabic ? 'اختار ثيم النظام' : 'Choose your system look'}</h2><p className="mt-1 text-xs font-bold text-muted">{isArabic ? 'كل اختيار يغير شكل النظام بالكامل.' : 'Each choice changes the entire system personality.'}</p></div><input value={query} onChange={(e) => setQuery(e.target.value)} className="theme-lab-search" placeholder={isArabic ? 'ابحث...' : 'Search...'} aria-label={isArabic ? 'البحث في الثيمات' : 'Search themes'} /></div>
                <div className="theme-lab-theme-grid">
                    {visibleThemes.map((item) => { const accent = THEME_ACCENTS[item.id] ?? ['#6366f1', '#06b6d4']; const selected = item.id === theme; return <button key={item.id} type="button" onClick={() => setTheme(item.id)} className={`theme-lab-theme-card ${selected ? 'is-active' : ''}`}><span className="theme-lab-theme-art" style={{ background: `linear-gradient(135deg, ${accent[0]}, ${accent[1]})` }}><span className="theme-lab-art-line" /><span className="theme-lab-art-line second" />{selected && <Check size={16} />}</span><span className="mt-2 flex items-center justify-between gap-2 text-sm font-black text-main"><span>{item.name}</span>{selected && <span className="theme-lab-active-dot" />}</span><span className="mt-1 block truncate text-[10px] font-bold text-muted">{item.tags.slice(0, 3).join(' · ')}</span></button>; })}
                </div>
            </section>

            <section className="theme-card theme-lab-section">
                <div className="theme-lab-section-head"><div><h2 className="text-sm font-black text-main">{isArabic ? 'خلفية النظام' : 'System background'}</h2><p className="mt-1 text-xs font-bold text-muted">{isArabic ? 'صور WebP محسنة تظهر خلف كل صفحات النظام.' : 'Curated WebP scenes that sit behind every page.'}</p></div><div className="theme-lab-current-background"><Image size={14} /> {activeBackgroundName}</div></div>
                <div className="theme-lab-background-grid">
                    {BACKGROUNDS.map((item) => { const selected = isActiveBackground(item.image); return <button key={item.id} type="button" onClick={() => applyBackground(withImage(item.image))} className={`theme-lab-background-card ${selected ? 'is-active' : ''}`}><span className="theme-lab-background-art" style={{ backgroundImage: `url(${item.image})` }}>{selected && <span className="theme-lab-background-check"><Check size={16} /></span>}</span><span className="mt-2 block text-xs font-black text-main">{isArabic ? item.nameAr : item.name}</span><span className="mt-0.5 block text-[10px] font-bold text-muted">{isArabic ? item.moodAr : item.mood}</span></button>; })}
                    <button type="button" onClick={() => uploadRef.current?.click()} className="theme-lab-upload-card"><Upload size={20} /><strong>{isArabic ? 'ارفع صورتك' : 'Upload your image'}</strong><span>{isArabic ? 'JPG / PNG / WebP · حتى 2.5MB' : 'JPG / PNG / WebP · up to 2.5MB'}</span></button>
                    <input ref={uploadRef} type="file" accept="image/png,image/jpeg,image/webp,image/avif" className="hidden" onChange={(e) => { handleUpload(e.target.files?.[0]); e.currentTarget.value = ''; }} />
                </div>
                <div className="theme-lab-background-controls"><label><span>{isArabic ? 'وضوح الخلفية' : 'Background visibility'}</span><input type="range" min=".2" max="1" step=".01" value={activeBackground.opacity ?? .82} onChange={(e) => applyBackground({ ...activeBackground, opacity: Number(e.target.value) })} /><b>{Math.round((activeBackground.opacity ?? .82) * 100)}%</b></label><button type="button" onClick={() => applyBackground({ type: 'theme-native' })} className="theme-lab-reset"><RotateCcw size={13} /> {isArabic ? 'إرجاع خلفية الثيم' : 'Reset to theme'}</button></div>
            </section>

            <div className="theme-lab-note"><Sparkles size={15} /><span>{isArabic ? 'الخلفية تظهر خلف المحتوى كله، بينما السايدبار والكروت تستخدم Overlay ذكي يحافظ على الوضوح.' : 'The scene spans the workspace, while the sidebar and cards use a smart readability overlay.'}</span></div>
            {message && <div className="theme-lab-toast" role="status">{message}</div>}
        </div>
    );
};

export default ThemeLab;
