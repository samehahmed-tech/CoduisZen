import type { ThemeConfig } from '../tokens';

export const micaGlassTheme: ThemeConfig = {
    id: 'mica-glass',
    name: 'Liquid Glass',
    description: 'Apple-inspired translucent glass surfaces with strong wallpaper depth',
    tags: ['Glass', 'iOS', 'Premium'],
    shape: { radius: '12px', radiusSm: '8px', radiusLg: '16px', radiusXl: '20px' },
    surfaces: { blur: '34px', surfaceOpacity: 0.58, borderWidth: '1px', borderOpacity: 0.38 },
    shadows: {
        card: '0 18px 46px rgba(15,23,42,0.10), inset 0 1px 0 rgba(255,255,255,0.28)',
        hover: '0 24px 68px rgba(15,23,42,0.14), inset 0 1px 0 rgba(255,255,255,0.34)',
        elevated: '0 32px 88px rgba(15,23,42,0.22), inset 0 1px 0 rgba(255,255,255,0.32)',
    },
    motion: { style: 'smooth', easing: 'cubic-bezier(0.16, 1, 0.3, 1)', duration: '200ms', durationSlow: '400ms' },
    typography: { fontWeight: 400, headingWeight: 600, letterSpacing: '0em' },
    spacing: { unit: '1rem', density: 1, gap: '1rem', sectionGap: '1.5rem' },
    components: {
        button: { variant: 'soft', height: '2.5rem', padding: '0.5rem 1rem' },
        card: { variant: 'glass' },
        sidebar: { variant: 'blurred', width: '250px', collapsedWidth: '70px' },
        table: { density: 'comfortable', rowHeight: '3rem' },
        input: { variant: 'filled', height: '2.5rem' },
        modal: { variant: 'centered' },
    },
    layout: { sidebarStyle: 'blurred', cardStyle: 'glass', density: 'normal', containerPadding: '1.5rem' },
};
