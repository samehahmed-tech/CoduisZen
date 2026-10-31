import { describe, expect, it } from 'vitest';
import { isMenuItemAvailableNow } from '../server/utils/menuAvailabilityPolicy';

describe('menu availability policy', () => {
    const cairo = 'Africa/Cairo';
    it('filters by days and a normal time window', () => {
        const mondayMorning = new Date('2026-10-26T07:00:00.000Z');
        expect(isMenuItemAvailableNow({ status: 'published', availableDays: ['mon'], availableFrom: '09:00', availableTo: '12:00' }, mondayMorning, cairo)).toBe(true);
        expect(isMenuItemAvailableNow({ status: 'published', availableDays: ['tue'], availableFrom: '09:00', availableTo: '12:00' }, mondayMorning, cairo)).toBe(false);
    });

    it('supports overnight windows and rejects archived items', () => {
        const lateNight = new Date('2026-10-26T22:30:00.000Z');
        expect(isMenuItemAvailableNow({ status: 'published', availableFrom: '23:00', availableTo: '02:00' }, lateNight, cairo)).toBe(true);
        expect(isMenuItemAvailableNow({ status: 'published', deletedAt: new Date(), availableFrom: '00:00', availableTo: '23:59' }, lateNight, cairo)).toBe(false);
    });

    it('keeps unrestricted published items available', () => {
        expect(isMenuItemAvailableNow({ status: 'published' }, new Date('2026-10-26T12:00:00.000Z'), cairo)).toBe(true);
        expect(isMenuItemAvailableNow({ status: 'draft' }, new Date(), cairo)).toBe(false);
    });
});
