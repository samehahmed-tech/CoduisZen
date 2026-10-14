import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
    settingsRows: [] as any[],
    branchRows: [] as any[],
    closedRows: [] as any[],
    userRows: [] as any[],
}));
const mockCloseDay = vi.hoisted(() => vi.fn());

vi.mock('../server/db', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../server/db')>();
    const schema = await import('../src/db/schema');
    const resolveRows = (table: any) => {
        if (table === (schema as any).settings) return mockState.settingsRows;
        if (table === (schema as any).branches) return mockState.branchRows;
        if (table === (schema as any).dayCloseReports) return mockState.closedRows;
        if (table === (schema as any).users) return mockState.userRows;
        return [];
    };
    const makeWhere = (table: any) => {
        const rows = resolveRows(table);
        const out: any = Promise.resolve(rows);
        out.top = () => Promise.resolve(rows);
        return out;
    };
    const makeFrom = (table: any) => {
        const rows = resolveRows(table);
        const pending: any = Promise.resolve(rows);
        pending.where = () => makeWhere(table);
        return pending;
    };
    const mockedSelect = () => ({
        top: () => ({ from: (table: any) => makeFrom(table) }),
        from: (table: any) => makeFrom(table),
    });
    const mockedDb = new Proxy(actual.db, {
        get(target, prop, receiver) {
            if (prop === 'select') return mockedSelect;
            const value = Reflect.get(target, prop, receiver);
            return typeof value === 'function' ? value.bind(target) : value;
        },
    });
    return { ...actual, db: mockedDb, default: mockedDb };
});

vi.mock('../server/services/dayCloseService', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../server/services/dayCloseService')>();
    return {
        ...actual,
        dayCloseService: { ...(actual as any).dayCloseService, closeDay: mockCloseDay },
    };
});

vi.mock('../server/utils/socketEmit', () => ({ emitBranchEvent: vi.fn() }));
vi.mock('../server/services/whatsappService', () => ({ sendWhatsAppText: vi.fn(async () => 'mock-wa-id') }));

import { getDayCloseAutoClose, isValidAutoCloseTime } from '../server/services/dayCloseService';
import { runAutoCloseOnce } from '../server/services/dayCloseAutoCloseService';

const localKey = (d = new Date()) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const enableAtMidnight = () => {
    mockState.settingsRows = [{ value: { enabled: true, time: '00:00' } }];
    mockState.branchRows = [{ id: 'b1', businessDate: localKey(), name: 'B1', currency: 'EGP' }];
    mockState.userRows = [{ id: 'admin-1', role: 'OWNER', isActive: true }];
};

beforeEach(() => {
    mockState.settingsRows = [];
    mockState.branchRows = [];
    mockState.closedRows = [];
    mockState.userRows = [];
    mockCloseDay.mockReset();
    mockCloseDay.mockResolvedValue({ id: 'mock-report' });
});

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

describe('day close auto-close scheduler', () => {
    it('does nothing when disabled', async () => {
        const res = await runAutoCloseOnce(new Date());
        expect(res.closed).toEqual([]);
    });
    it('never fires twice for the same branch and date', async () => {
        enableAtMidnight();
        await runAutoCloseOnce(new Date());
        const second = await runAutoCloseOnce(new Date());
        expect(second.closed).toEqual([]);
    });
    it('treats concurrent manual close as skip, not error', async () => {
        // pre-insert closed report for branch+date, then run
        enableAtMidnight();
        mockState.closedRows = [{ id: 'dayclose_b1', branchId: 'b1' }];
        const res = await runAutoCloseOnce(new Date());
        expect(res.skipped).toContain('b1');
    });
});
