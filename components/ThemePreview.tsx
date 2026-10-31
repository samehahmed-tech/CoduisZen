import type { CSSProperties } from 'react';
import type { ThemeConfig } from '../theme/tokens';
import '../styles/themes/v5.css';
import '../styles/theme-preview.css';

export const THEME_DESCRIPTIONS_AR: Record<ThemeConfig['id'], string> = {
    aero: 'Classic Corporate: كحلي منضبط، تسلسل مؤسسي واضح، ونسخة light/dark متوازنة.',
    citrus: 'Dark Premium: فحمي مطفي، نحاسي دافئ، وهدوء تنفيذي للعمليات المهمة.',
    porcelain: 'Light Minimal: مساحات بيضاء وهواء بصري وتركيز أزرق على القرار.',
    blueprint: 'Natural Wood: أوك دافئ، حبر إسبرسو، وبنية تحريرية إنسانية.',
    clay: 'Industrial Metal: فولاذ مصقول، فحم، وإشارات status حادة للـback-office.',
    nocturne: 'Marble Luxury: عروق حجر، شامبانيا معدنية، وفخامة ضيافة منضبطة.',
    foundry: 'Glass Transparent: طبقات شفافة وعمق بصري بارد من غير زخرفة زائدة.',
    neon: 'Green Sustainable: أخضر ورقي وmoss وإشارات هادئة مستوحاة من الطبيعة.',
    slate: 'Sandstone Earth: رمل وتراكوتا وتايبوغرافي أرضي بقراءة تشغيلية قوية.',
    cinema: 'Midnight Gold: منتصف ليل، ذهب مصقول، وتباين جريء للهوية المميزة.',
};

/** Decorative workspace, using the same palette and shape tokens as the app. */
export function ThemePreview({ theme }: { theme: ThemeConfig }) {
    const style = {
        '--preview-radius': theme.shape.radius,
        '--preview-radius-sm': theme.shape.radiusSm,
        '--preview-border': theme.surfaces.borderWidth,
    } as CSSProperties;

    return (
        <span className="theme-preview" data-theme={theme.id} style={style} aria-hidden="true">
            <span className="theme-preview-rail">
                <span className="theme-preview-logo" />
                <span className="theme-preview-nav is-current" /><span className="theme-preview-nav" />
                <span className="theme-preview-nav" /><span className="theme-preview-nav" />
                <span className="theme-preview-avatar" />
            </span>
            <span className="theme-preview-workspace">
                <span className="theme-preview-toolbar"><span /><i /></span>
                <span className="theme-preview-heading"><i /><span /></span>
                <span className="theme-preview-metrics">
                    {[0, 1, 2].map((index) => <span className="theme-preview-metric" key={index}><i /><b /><em /></span>)}
                </span>
                <span className="theme-preview-content">
                    <span className="theme-preview-chart"><span /><span /><span /><span /><span /><span /><span /></span>
                    <span className="theme-preview-list"><i /><i /><i /></span>
                </span>
            </span>
        </span>
    );
}
