import type { ThemeConfig } from '../tokens';

export const flatMinimalTheme: ThemeConfig = {
    id: 'flat-minimal',
    name: 'Cairo Minimal',
    description: 'Crisp Arabic-first neutral interface for fast daily operations',
    tags: ['Minimal', 'Arabic', 'Fast'],
    shape: { radius: '4px', radiusSm: '2px', radiusLg: '6px', radiusXl: '8px' },
    surfaces: { blur: '0px', surfaceOpacity: 1, borderWidth: '1px', borderOpacity: 1 },
    shadows: { card: 'none', hover: 'none', elevated: 'none' },
    motion: { style: 'instant', easing: 'linear', duration: '0ms', durationSlow: '0ms' },
    typography: { fontWeight: 400, headingWeight: 600, letterSpacing: '0em' },
    spacing: { unit: '0.875rem', density: 0.9, gap: '0.75rem', sectionGap: '1rem' },
    components: {
        button: { variant: 'solid', height: '2rem', padding: '0.25rem 0.75rem' },
        card: { variant: 'flat' },
        sidebar: { variant: 'solid', width: '220px', collapsedWidth: '50px' },
        table: { density: 'dense', rowHeight: '2.5rem' },
        input: { variant: 'outline', height: '2rem' },
        modal: { variant: 'centered' },
    },
    layout: { sidebarStyle: 'solid', cardStyle: 'flat', density: 'compact', containerPadding: '1rem' },
};
