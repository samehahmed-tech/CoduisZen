import type { ThemeConfig } from '../tokens';

export const fluentCleanTheme: ThemeConfig = {
    id: 'fluent-clean',
    name: 'Fluent Eleven',
    description: 'Windows 11 inspired clarity with soft command surfaces',
    tags: ['Windows', 'Fluent', 'Professional'],
    shape: { radius: '8px', radiusSm: '6px', radiusLg: '12px', radiusXl: '16px' },
    surfaces: { blur: '12px', surfaceOpacity: 0.92, borderWidth: '1px', borderOpacity: 0.48 },
    shadows: {
        card: '0 1px 3px rgba(25,31,40,0.05)',
        hover: '0 8px 20px rgba(25,31,40,0.08)',
        elevated: '0 18px 42px rgba(25,31,40,0.12)',
    },
    motion: { style: 'crisp', easing: 'ease', duration: '150ms', durationSlow: '250ms' },
    typography: { fontWeight: 400, headingWeight: 600, letterSpacing: '0em' },
    spacing: { unit: '1rem', density: 1, gap: '1rem', sectionGap: '1.5rem' },
    components: {
        button: { variant: 'solid', height: '2.25rem', padding: '0.375rem 1rem' },
        card: { variant: 'flat' },
        sidebar: { variant: 'solid', width: '240px', collapsedWidth: '64px' },
        table: { density: 'comfortable', rowHeight: '2.75rem' },
        input: { variant: 'outline', height: '2.25rem' },
        modal: { variant: 'centered' },
    },
    layout: { sidebarStyle: 'solid', cardStyle: 'flat', density: 'normal', containerPadding: '1.5rem' },
};
