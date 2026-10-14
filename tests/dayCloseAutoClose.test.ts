import { describe, expect, it, vi } from 'vitest';

vi.mock('../server/db', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../server/db')>();
    const mockedSelect = () => ({ top: () => ({ from: () => ({ where: async () => [] }) }) });
    const mockedDb = new Proxy(actual.db, {
        get(target, prop, receiver) {
            if (prop === 'select') return mockedSelect;
            const value = Reflect.get(target, prop, receiver);
            return typeof value === 'function' ? value.bind(target) : value;
        },
    });
    return { ...actual, db: mockedDb, default: mockedDb };
});

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
