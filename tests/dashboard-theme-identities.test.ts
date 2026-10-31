import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { V2_THEME_IDS } from '../theme/engine/migrate';

const rootFile = (path: string) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), 'utf8');

describe('dashboard theme identities', () => {
    const entry = rootFile('index.css');
    const css = rootFile('styles/themes/dashboard-personalities.css');

    it('loads the dashboard identity layer after wallpaper, background engine, and 2026 identity rules', () => {
        const dashboardLayer = entry.lastIndexOf('@import "./styles/themes/dashboard-personalities.css"');
        expect(dashboardLayer).toBeGreaterThan(entry.indexOf('@import "./styles/globals/wallpaper.css"'));
        expect(dashboardLayer).toBeGreaterThan(entry.indexOf('@import "./styles/engine/background-engine.css"'));
        expect(dashboardLayer).toBeGreaterThan(entry.indexOf('@import "./styles/themes/identity-2026.css"'));
    });

    it.each(V2_THEME_IDS)('%s defines its own dashboard material and both modes', themeId => {
        expect(css).toContain(`html[data-theme="${themeId}"]`);
        expect(css).toContain(`html[data-theme="${themeId}"]:not(.dark)`);
        expect(css).toContain(`html.dark[data-theme="${themeId}"]`);
    });

    it('overrides the real hero, panels, metrics, status strip, and photo-background mode', () => {
        for (const selector of ['.hx-greet', '.hx-today', '.hx-rev', '.hx-visual', '.dx2-panel', '.dx-metric', '.dx2-status']) {
            expect(css).toContain(selector);
        }
        expect(css).toContain('.workspace-shell[data-bg-engine] .dx');
    });

    it('beats the legacy high-specificity decision-card geometry', () => {
        expect(css).toContain('.dx-metric.dx-metric');
        expect(css).toContain('.dx2-panel.dx2-panel');
    });

    it('encodes structural differences rather than ten colour swaps', () => {
        const radii = [...css.matchAll(/--dash-card-radius:\s*([^;]+);/g)].map(match => match[1].trim());
        expect(new Set(radii).size).toBeGreaterThanOrEqual(7);
        expect(css).toContain('ui-monospace');
        expect(css).toContain('backdrop-filter');
        expect(css).toContain('nth-child(2n)');
    });
});
