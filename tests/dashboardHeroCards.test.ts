import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const rootFile = (path: string) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), 'utf8');

describe('dashboard pulse cards', () => {
    const dashboard = rootFile('components/Dashboard.tsx');
    const layoutCss = rootFile('styles/layout/dashboard-x.css');

    it('uses the login artwork for four non-repeating operational summaries', () => {
        for (const card of ['sales', 'orders', 'profit', 'priority']) {
            expect(dashboard).toContain(`hx-card hx-card-${card}`);
        }

        expect(dashboard).toContain('totals.cancelRate');
        expect(dashboard).toContain('totals.netProfit');
        expect(dashboard).toContain('totals.pending');
        expect(dashboard).toContain('criticalAlert');
        expect(dashboard).not.toContain('const heroTips');
        expect(dashboard).not.toContain('setHeroTip');

        for (const wallpaper of ['midnight.webp', 'violet.webp', 'copper.webp']) {
            expect(layoutCss).toContain(`/wallpapers/webp/${wallpaper}`);
        }
        expect(layoutCss).toContain('.hx-card-media');
        expect(layoutCss).toContain('.hx-card-overlay');
        expect(layoutCss).toContain('.hx-card-action:focus-visible');
        expect(layoutCss).toContain('@media (prefers-reduced-motion: reduce)');
    });
});
