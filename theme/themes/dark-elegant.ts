import type { ThemeConfig } from '../tokens';

export const darkElegantTheme: ThemeConfig = {
    id: 'dark-elegant',
    name: 'Executive Graphite',
    description: 'Premium restrained leadership UI with balanced light and dark modes',
    tags: ['Executive', 'Premium', 'Graphite'],
    shape: { radius: '8px', radiusSm: '4px', radiusLg: '12px', radiusXl: '16px' },
    surfaces: { blur: '0px', surfaceOpacity: 1, borderWidth: '1px', borderOpacity: 1 },
    shadows: {
        card: '0 6px 18px rgba(15,23,42,0.08)',
        hover: '0 12px 30px rgba(15,23,42,0.12)',
        elevated: '0 24px 54px rgba(15,23,42,0.18)',
    },
    motion: { style: 'smooth', easing: 'ease', duration: '200ms', durationSlow: '300ms' },
    typography: { fontWeight: 400, headingWeight: 600, letterSpacing: '0.01em' },
    spacing: { unit: '1rem', density: 1, gap: '1rem', sectionGap: '1.5rem' },
    components: {
        button: { variant: 'solid', height: '2.5rem', padding: '0.625rem 1.25rem' },
        card: { variant: 'elevated' },
        sidebar: { variant: 'solid', width: '250px', collapsedWidth: '64px' },
        table: { density: 'comfortable', rowHeight: '3rem' },
        input: { variant: 'outline', height: '2.5rem' },
        modal: { variant: 'centered' },
    },
    layout: { sidebarStyle: 'solid', cardStyle: 'elevated', density: 'normal', containerPadding: '1.5rem' },
};
