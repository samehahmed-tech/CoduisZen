import type { ThemeConfig } from '../tokens';

export const neumorphismSoftTheme: ThemeConfig = {
    id: 'neumorphism-soft',
    name: 'Soft Touch',
    description: 'Tactile and approachable surfaces for hospitality teams',
    tags: ['Tactile', 'Soft', 'Hospitality'],
    shape: { radius: '12px', radiusSm: '8px', radiusLg: '16px', radiusXl: '20px' },
    surfaces: { blur: '0px', surfaceOpacity: 1, borderWidth: '0px', borderOpacity: 0 },
    shadows: {
        card: '6px 6px 14px var(--dark-shadow), -6px -6px 14px var(--light-shadow)',
        hover: '8px 8px 18px var(--dark-shadow), -8px -8px 18px var(--light-shadow)',
        elevated: '12px 12px 28px var(--dark-shadow), -12px -12px 28px var(--light-shadow)',
    },
    motion: { style: 'smooth', easing: 'ease', duration: '200ms', durationSlow: '300ms' },
    typography: { fontWeight: 500, headingWeight: 700, letterSpacing: '0em' },
    spacing: { unit: '1rem', density: 1, gap: '1.25rem', sectionGap: '2rem' },
    components: {
        button: { variant: 'solid', height: '3rem', padding: '0.75rem 1.75rem' },
        card: { variant: 'flat' },
        sidebar: { variant: 'solid', width: '250px', collapsedWidth: '80px' },
        table: { density: 'comfortable', rowHeight: '3.5rem' },
        input: { variant: 'filled', height: '3rem' },
        modal: { variant: 'centered' },
    },
    layout: { sidebarStyle: 'solid', cardStyle: 'flat', density: 'normal', containerPadding: '2rem' },
};
