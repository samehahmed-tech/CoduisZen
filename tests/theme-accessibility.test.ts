import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../theme/engine/color';
import { V2_THEME_IDS } from '../theme/engine/migrate';

function palette(id: string, dark: boolean): Record<string, string> {
    const alias = readFileSync(fileURLToPath(new URL(`../styles/themes/${id}.css`, import.meta.url)), 'utf8');
    // V2 files are stable import entrypoints; the canonical palettes live in
    // the bundled V5 layer so runtime and accessibility checks share one source.
    const css = alias.includes('@import')
        ? readFileSync(fileURLToPath(new URL('../styles/themes/v5.css', import.meta.url)), 'utf8')
        : alias;
    const values: Record<string, string> = {};
    postcss.parse(css).walkRules(rule => {
        if (!rule.selector.includes(`[data-theme="${id}"]`)) return;
        if (rule.selector.includes('.dark') && !dark) return;
        rule.walkDecls(declaration => { values[declaration.prop] = declaration.value; });
    });
    return values;
}

function tripletHex(value: string): string {
    const channels = value.split(',').map(Number);
    expect(channels).toHaveLength(3);
    expect(channels.every(channel => Number.isFinite(channel) && channel >= 0 && channel <= 255)).toBe(true);
    return `#${channels.map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
}

for (const id of V2_THEME_IDS) {
    for (const dark of [false, true]) {
        describe(`${id} ${dark ? 'dark' : 'light'} readability`, () => {
            const colors = palette(id, dark);
            for (const foreground of ['--text-main', '--text-muted']) {
                for (const surface of ['--bg-app', '--bg-card', '--bg-elevated']) {
                    it(`${foreground} remains readable on ${surface}`, () => {
                        expect(contrastRatio(tripletHex(colors[foreground]), tripletHex(colors[surface]))).toBeGreaterThanOrEqual(4.5);
                    });
                }
            }
            it('provides explicit readable action text across the entire button gradient', () => {
                expect(colors['--theme-button-text']).toMatch(/^#[0-9a-f]{6}$/i);
                for (const property of ['--theme-button-bg', '--theme-button-bg-hover']) {
                    if (!colors[property]) continue;
                    const stops = colors[property].match(/#[0-9a-f]{6}\b/gi) ?? [];
                    expect(stops.length).toBeGreaterThan(0);
                    // Sample interpolated colours as well as stops: a gradient can lose contrast between endpoints.
                    const samples = [...stops];
                    for (let index = 1; index < stops.length; index++) {
                        for (let step = 1; step < 10; step++) {
                            const channels = [1, 3, 5].map(offset => Math.round(
                                parseInt(stops[index - 1].slice(offset, offset + 2), 16) * (1 - step / 10)
                                + parseInt(stops[index].slice(offset, offset + 2), 16) * step / 10,
                            ));
                            samples.push(tripletHex(channels.join(',')));
                        }
                    }
                    for (const background of samples) {
                        expect(contrastRatio(colors['--theme-button-text'], background), `${property} at ${background}`).toBeGreaterThanOrEqual(4.5);
                    }
                }
            });
        });
    }
}
