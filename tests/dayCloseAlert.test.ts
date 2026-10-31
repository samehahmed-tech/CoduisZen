import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), 'utf8');
const layout = read('components/MainLayout.tsx');
const styles = read('index.css');

describe('stale business date alert', () => {
  it('presents an actionable, theme-aware operational status card', () => {
    expect(layout).toContain('day-close-alert');
    expect(layout).toContain('aria-live="polite"');
    expect(layout).toContain('day-close-alert__dates');
    expect(layout).toContain('day-close-alert__action');
    expect(layout).toContain('pointer-events-none');
    expect(styles).toContain('.day-close-alert__surface');
    expect(styles).toContain('var(--warning)');
    expect(styles).toContain('background: rgb(var(--bg-card));');
    expect(layout).toContain('max-w-[640px]');
    expect(styles).not.toContain('color-mix(in srgb, var(--warning)');
  });

  it('keeps the warning usable on narrow screens and quiet when motion is reduced', () => {
    expect(styles).toContain('@media (max-width: 640px)');
    expect(styles).toContain('.day-close-alert__dates');
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(styles).toContain('.day-close-alert__surface');
  });
});
