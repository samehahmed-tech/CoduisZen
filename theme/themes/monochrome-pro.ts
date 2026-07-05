import type { ThemeConfig } from '../tokens';

export const monochromeProTheme: ThemeConfig = {
    id: 'monochrome-pro',
    name: 'Graphite Pro',
    description: 'Editorial monochrome clarity with restrained operational contrast',
    tags: ['Monochrome', 'Editorial', 'Professional'],
    shape: { radius: '6px', radiusSm: '4px', radiusLg: '8px', radiusXl: '12px' },
    surfaces: { blur: '0px', surfaceOpacity: 1, borderWidth: '1px', borderOpacity: 1 },
    shadows: {
        card: 'none',
        hover: 'none',
        elevated: '0 4px 20px rgba(0,0,0,0.12)',
    },
    motion: { style: 'crisp', easing: 'ease', duration: '150ms', durationSlow: '200ms' },
    typography: { fontWeight: 400, headingWeight: 700, letterSpacing: '-0.02em' },
    spacing: { unit: '1rem', density: 1, gap: '1.5rem', sectionGap: '2rem' },
    components: {
        button: { variant: 'solid', height: '2.5rem', padding: '0.5rem 1rem' },
        card: { variant: 'flat' },
        sidebar: { variant: 'solid', width: '250px', collapsedWidth: '64px' },
        table: { density: 'comfortable', rowHeight: '3rem' },
        input: { variant: 'outline', height: '2.5rem' },
        modal: { variant: 'centered' },
    },
    layout: { sidebarStyle: 'solid', cardStyle: 'flat', density: 'normal', containerPadding: '2rem' },
};
