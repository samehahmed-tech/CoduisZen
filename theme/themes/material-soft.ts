import type { ThemeConfig } from '../tokens';

export const materialSoftTheme: ThemeConfig = {
    id: 'material-soft',
    name: 'Studio Material',
    description: 'Rounded material surfaces with gentle elevation and friendly controls',
    tags: ['Material', 'Rounded', 'Friendly'],
    shape: { radius: '16px', radiusSm: '10px', radiusLg: '20px', radiusXl: '24px' },
    surfaces: { blur: '0px', surfaceOpacity: 1, borderWidth: '0px', borderOpacity: 0 },
    shadows: {
        card: '0 2px 8px rgba(103, 80, 164, 0.08)',
        hover: '0 8px 16px rgba(103, 80, 164, 0.12)',
        elevated: '0 16px 32px rgba(103, 80, 164, 0.15)',
    },
    motion: { style: 'springy', easing: 'cubic-bezier(0.2, 0, 0, 1)', duration: '250ms', durationSlow: '400ms' },
    typography: { fontWeight: 400, headingWeight: 500, letterSpacing: '0.01em' },
    spacing: { unit: '1rem', density: 1, gap: '1rem', sectionGap: '1.5rem' },
    components: {
        button: { variant: 'solid', height: '2.5rem', padding: '0.5rem 1.5rem' },
        card: { variant: 'elevated' },
        sidebar: { variant: 'solid', width: '260px', collapsedWidth: '72px' },
        table: { density: 'comfortable', rowHeight: '3rem' },
        input: { variant: 'filled', height: '3rem' },
        modal: { variant: 'centered' },
    },
    layout: { sidebarStyle: 'solid', cardStyle: 'elevated', density: 'normal', containerPadding: '1.5rem' },
};
