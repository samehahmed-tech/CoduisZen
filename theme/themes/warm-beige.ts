import type { ThemeConfig } from '../tokens';

export const warmBeigeTheme: ThemeConfig = {
    id: 'warm-beige',
    name: 'Warm Ledger',
    description: 'Approachable hospitality warmth with accounting-grade readability',
    tags: ['Warm', 'Hospitality', 'Readable'],
    shape: { radius: '10px', radiusSm: '6px', radiusLg: '16px', radiusXl: '20px' },
    surfaces: { blur: '0px', surfaceOpacity: 1, borderWidth: '1px', borderOpacity: 1 },
    shadows: {
        card: '0 2px 8px rgba(63, 45, 32, 0.05)',
        hover: '0 8px 16px rgba(63, 45, 32, 0.08)',
        elevated: '0 16px 32px rgba(63, 45, 32, 0.1)',
    },
    motion: { style: 'smooth', easing: 'cubic-bezier(0.4, 0, 0.2, 1)', duration: '250ms', durationSlow: '350ms' },
    typography: { fontWeight: 400, headingWeight: 600, letterSpacing: '0em' },
    spacing: { unit: '1rem', density: 1, gap: '1.25rem', sectionGap: '1.5rem' },
    components: {
        button: { variant: 'soft', height: '2.75rem', padding: '0.625rem 1.25rem' },
        card: { variant: 'flat' },
        sidebar: { variant: 'solid', width: '260px', collapsedWidth: '72px' },
        table: { density: 'comfortable', rowHeight: '3rem' },
        input: { variant: 'outline', height: '2.75rem' },
        modal: { variant: 'centered' },
    },
    layout: { sidebarStyle: 'solid', cardStyle: 'flat', density: 'normal', containerPadding: '1.5rem' },
};
