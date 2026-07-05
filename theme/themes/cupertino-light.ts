import type { ThemeConfig } from '../tokens';

export const cupertinoLightTheme: ThemeConfig = {
    id: 'cupertino-light',
    name: 'Cupertino Desk',
    description: 'Polished Apple-like calm for executive and front-desk workflows',
    tags: ['Apple', 'Polished', 'Calm'],
    shape: { radius: '10px', radiusSm: '6px', radiusLg: '16px', radiusXl: '24px' },
    surfaces: { blur: '40px', surfaceOpacity: 0.8, borderWidth: '1px', borderOpacity: 0.5 },
    shadows: {
        card: '0 1px 3px rgba(0,0,0,0.06)',
        hover: '0 4px 12px rgba(0,0,0,0.08)',
        elevated: '0 10px 40px rgba(0,0,0,0.15)',
    },
    motion: { style: 'springy', easing: 'cubic-bezier(0.25, 1, 0.5, 1)', duration: '250ms', durationSlow: '400ms' },
    typography: { fontWeight: 400, headingWeight: 600, letterSpacing: '-0.02em' },
    spacing: { unit: '1rem', density: 1, gap: '1rem', sectionGap: '1.5rem' },
    components: {
        button: { variant: 'solid', height: '2.25rem', padding: '0.375rem 1rem' },
        card: { variant: 'elevated' },
        sidebar: { variant: 'blurred', width: '260px', collapsedWidth: '70px' },
        table: { density: 'comfortable', rowHeight: '2.75rem' },
        input: { variant: 'outline', height: '2.25rem' },
        modal: { variant: 'centered' },
    },
    layout: { sidebarStyle: 'blurred', cardStyle: 'flat', density: 'normal', containerPadding: '2rem' },
};
