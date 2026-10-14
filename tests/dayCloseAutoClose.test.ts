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
        // The mock stands in for the DB, so it mirrors the service's DB-side
        // WHERE clauses: active branches only; active SUPER_ADMIN/OWNER users only.
        if (table === (schema as any).settings) return mockState.settingsRows;
        if (table === (schema as any).branches) return mockState.branchRows.filter((r) => r?.isActive !== false);
        if (table === (schema as any).dayCloseReports) return mockState.closedRows;
        if (table === (schema as any).users) {
            return mockState.userRows
                .filter((u) => u?.isActive === true && ['SUPER_ADMIN', 'OWNER'].includes(String(u?.role)))
                .sort((a: any, b: any) => String(a?.id).localeCompare(String(b?.id)));
        }
        return [];
    };
    const makeTop = (table: any) => () => Promise.resolve(resolveRows(table));
    const makeWhere = (table: any) => {
        const out: any = Promise.resolve(resolveRows(table));
        out.top = makeTop(table);
        out.orderBy = () => ({ top: makeTop(table) });
        return out;
    };
    const makeFrom = (table: any) => {
        const pending: any = Promise.resolve(resolveRows(table));
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
import { clearLastRunForTests, runAutoCloseOnce } from '../server/services/dayCloseAutoCloseService';
import { emitBranchEvent } from '../server/utils/socketEmit';
import { sendWhatsAppText } from '../server/services/whatsappService';

const localKey = (d = new Date()) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const enableAtMidnight = () => {
    mockState.settingsRows = [{ value: { enabled: true, time: '00:00' } }];
    mockState.branchRows = [{ id: 'b1', businessDate: localKey(), name: 'B1', currency: 'EGP', isActive: true }];
    mockState.userRows = [{ id: 'admin-1', role: 'OWNER', isActive: true }];
};

beforeEach(() => {
    mockState.settingsRows = [];
    mockState.branchRows = [];
    mockState.closedRows = [];
    mockState.userRows = [];
    mockCloseDay.mockReset();
    mockCloseDay.mockResolvedValue({ id: 'mock-report' });
    vi.mocked(emitBranchEvent).mockClear();
    vi.mocked(sendWhatsAppText).mockClear();
    clearLastRunForTests();
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
    it('returns skipped branch ids when no actor exists', async () => {
        enableAtMidnight();
        mockState.userRows = [];
        const res = await runAutoCloseOnce(new Date());
        expect(res.closed).toEqual([]);
        expect(res.skipped).toContain('b1');
        expect(mockCloseDay).not.toHaveBeenCalled();
    });
    it('never attempts inactive branches', async () => {
        enableAtMidnight();
        mockState.branchRows = [
            { id: 'b1', businessDate: localKey(), isActive: true },
            { id: 'b2', businessDate: localKey(), isActive: false },
        ];
        const res = await runAutoCloseOnce(new Date());
        expect(res.closed).toContain('b1');
        expect(res.closed).not.toContain('b2');
        expect(mockCloseDay.mock.calls.map((c) => c[0])).not.toContain('b2');
    });
    it('suppresses closeDay generic WhatsApp via notifyWhatsapp:false', async () => {
        enableAtMidnight();
        await runAutoCloseOnce(new Date());
        expect(mockCloseDay).toHaveBeenCalledTimes(1);
        expect(mockCloseDay.mock.calls[0][3]).toMatchObject({ autoCloseOpenShifts: true, notifyWhatsapp: false });
    });
    it('emits auto-failure event on exceptional error', async () => {
        enableAtMidnight();
        mockCloseDay.mockRejectedValueOnce(Object.assign(new Error('DB_DOWN'), { code: 'EREQUEST' }));
        const res = await runAutoCloseOnce(new Date());
        expect(res.closed).toEqual([]);
        expect(res.skipped).toContain('b1');
        expect(vi.mocked(emitBranchEvent).mock.calls.map((c) => c[1])).toContain('day-close:auto-failure');
    });
    it('records date mismatch in lastRun instead of retrying every tick', async () => {
        enableAtMidnight();
        mockCloseDay.mockRejectedValue(new Error('BUSINESS_DATE_MISMATCH'));
        const first = await runAutoCloseOnce(new Date());
        const second = await runAutoCloseOnce(new Date());
        expect(first.skipped).toContain('b1');
        expect(second.skipped).toContain('b1');
        expect(mockCloseDay).toHaveBeenCalledTimes(1);
    });
    it('notes catch-up in the override reason', async () => {
        enableAtMidnight();
        await runAutoCloseOnce(new Date(), { catchUp: true });
        expect(String(mockCloseDay.mock.calls[0][3]?.overrideReason)).toContain('(catch-up)');
    });
});
