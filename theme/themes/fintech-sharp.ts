import type { ThemeConfig } from '../tokens';

export const fintechSharpTheme: ThemeConfig = {
    id: 'fintech-sharp',
    name: 'Ledger Sharp',
    description: 'Dense finance-grade precision for reports, cashiering, and controls',
    tags: ['Finance', 'Dense', 'Sharp'],
    shape: { radius: '8px', radiusSm: '4px', radiusLg: '12px', radiusXl: '16px' },
    surfaces: { blur: '0px', surfaceOpacity: 1, borderWidth: '1px', borderOpacity: 1 },
    shadows: {
        card: '0 2px 5px rgba(10, 37, 64, 0.08), 0 1px 1px rgba(10, 37, 64, 0.04)',
        hover: '0 8px 20px rgba(10, 37, 64, 0.12), 0 3px 6px rgba(10, 37, 64, 0.06)',
        elevated: '0 20px 40px rgba(10, 37, 64, 0.15), 0 8px 16px rgba(10, 37, 64, 0.08)',
    },
    motion: { style: 'crisp', easing: 'cubic-bezier(0.4, 0, 0.2, 1)', duration: '200ms', durationSlow: '300ms' },
    typography: { fontWeight: 500, headingWeight: 700, letterSpacing: '-0.01em' },
    spacing: { unit: '1rem', density: 1, gap: '1rem', sectionGap: '1.5rem' },
    components: {
        button: { variant: 'solid', height: '2.5rem', padding: '0.5rem 1rem' },
        card: { variant: 'flat' },
        sidebar: { variant: 'solid', width: '250px', collapsedWidth: '60px' },
        table: { density: 'comfortable', rowHeight: '3rem' },
        input: { variant: 'outline', height: '2.5rem' },
        modal: { variant: 'centered' },
    },
    layout: { sidebarStyle: 'solid', cardStyle: 'flat', density: 'normal', containerPadding: '1.5rem' },
};
