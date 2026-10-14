import { describe, expect, it } from 'vitest';
import { getDayCloseAutoClose, isValidAutoCloseTime } from '../server/services/dayCloseService';

describe('day close auto-close settings', () => {
    it('rejects invalid auto-close times', () => {
        expect(isValidAutoCloseTime('25:99')).toBe(false);
        expect(isValidAutoCloseTime('')).toBe(false);
        expect(isValidAutoCloseTime('23:59')).toBe(true);
    });
    it('defaults to disabled when unset', async () => {
        await expect(getDayCloseAutoClose()).resolves.toEqual({ enabled: false, time: '23:59' });
    });
});
