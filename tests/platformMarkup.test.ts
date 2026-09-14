import { describe, expect, it } from 'vitest';
import { applyPlatformMarkup, matchPlatformMarkup, platformMarkupAmount } from '../services/platformPricing';

describe('platform silent pricing', () => {
    it('returns base price untouched for restaurant source', () => {
        expect(matchPlatformMarkup([], 'restaurant')).toBeNull();
        expect(matchPlatformMarkup([], '')).toBeNull();
        expect(applyPlatformMarkup(100, 0, 0)).toBe(100);
    });

    it('matches platform by id or name (case-insensitive)', () => {
        const platforms: any[] = [
            { id: 'talabat', name: 'Talabat', isActive: true, applyFeesToMenuPrice: true, priceMarkupPercentage: 15, priceMarkupFixed: 0 },
            { id: 'elmenus', name: 'Elmenus', isActive: true, applyFeesToMenuPrice: false, priceMarkupPercentage: 20, priceMarkupFixed: 0 },
        ];
        expect(matchPlatformMarkup(platforms, 'Talabat')).toEqual({ platformId: 'talabat', pct: 15, fixed: 0 });
        expect(matchPlatformMarkup(platforms, 'talabat')).toEqual({ platformId: 'talabat', pct: 15, fixed: 0 });
        // applyFeesToMenuPrice off => no markup
        expect(matchPlatformMarkup(platforms, 'elmenus')).toBeNull();
        expect(matchPlatformMarkup(platforms, 'jahez')).toBeNull();
    });

    it('applies percentage markup with bank rounding parity', () => {
        // Mirrors server: round2(base * (1 + pct/100) + fixed)
        expect(applyPlatformMarkup(100, 15, 0)).toBe(115);
        expect(applyPlatformMarkup(99.99, 15, 0)).toBe(114.99);
        expect(applyPlatformMarkup(100, 0, 5)).toBe(105);
        expect(platformMarkupAmount(100, 15, 0)).toBe(15);
    });
});
