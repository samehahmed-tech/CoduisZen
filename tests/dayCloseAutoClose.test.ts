import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
    settingsRows: [] as any[],
    branchRows: [] as any[],
    closedRows: [] as any[],
    userRows: [] as any[],
    auditRows: [] as any[],
}));
const mockCloseDay = vi.hoisted(() => vi.fn());

vi.mock('../server/db', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../server/db')>();
    const schema = await import('../src/db/schema');
    // Pull bind-param string literals (e.g. settings keys) out of drizzle
    // SQL predicates so the mock can mirror DB-side WHERE filtering.
    const sqlLiterals = (node: any, out: string[] = []): string[] => {
        if (node === null || node === undefined || typeof node === 'string') return out;
        if (Array.isArray(node)) { for (const item of node) sqlLiterals(item, out); return out; }
        if (typeof node !== 'object') return out;
        if ((node as any)?.constructor?.name === 'Param' && typeof (node as any).value === 'string') {
            out.push((node as any).value);
            return out;
        }
        if (Array.isArray((node as any).queryChunks)) {
            for (const chunk of (node as any).queryChunks) sqlLiterals(chunk, out);
        }
        return out;
    };
    const resolveRows = (table: any, whereArgs: any[] = []) => {
        // The mock stands in for the DB, so it mirrors the service's DB-side
        // WHERE clauses: active branches only; active SUPER_ADMIN/OWNER users only.
        if (table === (schema as any).settings) {
            const lits = new Set<string>();
            for (const arg of whereArgs) for (const lit of sqlLiterals(arg)) lits.add(lit);
            if (lits.size === 0) return mockState.settingsRows;
            return mockState.settingsRows.filter((r) => !('key' in r) || lits.has(String((r as any).key)));
        }
        if (table === (schema as any).branches) return mockState.branchRows.filter((r) => r?.isActive !== false);
        if (table === (schema as any).dayCloseReports) return mockState.closedRows;
        if (table === (schema as any).auditLogs) return mockState.auditRows;
        if (table === (schema as any).users) {
            return mockState.userRows
                .filter((u) => u?.isActive === true && ['SUPER_ADMIN', 'OWNER'].includes(String(u?.role)))
                .sort((a: any, b: any) => String(a?.id).localeCompare(String(b?.id)));
        }
        return [];
    };
    const makeFetch = (table: any, args: any[]) => (n?: number) =>
        Promise.resolve(resolveRows(table, args).slice(0, n ?? 10));
    const makeTop = (table: any, args: any[] = []) => () => Promise.resolve(resolveRows(table, args));
    const makeWhere = (table: any) => (...args: any[]) => {
        const out: any = Promise.resolve(resolveRows(table, args));
        out.top = makeTop(table, args);
        out.orderBy = () => ({ top: makeTop(table, args), offset: () => ({ fetch: makeFetch(table, args) }) });
        return out;
    };
    const makeFrom = (table: any) => {
        const pending: any = Promise.resolve(resolveRows(table));
        pending.where = makeWhere(table);
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

import { dayCloseService, getDayCloseAutoClose, isValidAutoCloseTime } from '../server/services/dayCloseService';
import { clearLastRunForTests, runAutoCloseOnce } from '../server/services/dayCloseAutoCloseService';
import { emitBranchEvent } from '../server/utils/socketEmit';
import { sendWhatsAppText } from '../server/services/whatsappService';

const localKey = (d = new Date()) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// A business date is only auto-closed once it is strictly before today.
// Tests model the normal case: at the configured time the branch still holds
// yesterday's business date (the day that just finished).
const yesterdayKey = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return localKey(d);
};

const enableAtMidnight = () => {
    mockState.settingsRows = [{ value: { enabled: true, time: '00:00' } }];
    mockState.branchRows = [{ id: 'b1', businessDate: yesterdayKey(), name: 'B1', currency: 'EGP', isActive: true }];
    mockState.userRows = [{ id: 'admin-1', role: 'OWNER', isActive: true }];
};

beforeEach(() => {
    mockState.settingsRows = [];
    mockState.branchRows = [];
    mockState.closedRows = [];
    mockState.userRows = [];
    mockState.auditRows = [];
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
            { id: 'b1', businessDate: yesterdayKey(), isActive: true },
            { id: 'b2', businessDate: yesterdayKey(), isActive: false },
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
    it('does not close a business date that is today (fresh day)', async () => {
        enableAtMidnight();
        mockState.branchRows = [{ id: 'b1', businessDate: localKey(), isActive: true }];
        const res = await runAutoCloseOnce(new Date());
        expect(res.closed).toEqual([]);
        expect(mockCloseDay).not.toHaveBeenCalled();
    });
    it('never closes a future business date', async () => {
        enableAtMidnight();
        const future = new Date();
        future.setDate(future.getDate() + 5);
        mockState.branchRows = [{ id: 'b1', businessDate: localKey(future), isActive: true }];
        const res = await runAutoCloseOnce(new Date());
        expect(res.closed).toEqual([]);
        expect(mockCloseDay).not.toHaveBeenCalled();
    });
    it('closes at most one day per calendar day when the branch is behind', async () => {
        enableAtMidnight();
        const twoDaysAgo = new Date();
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
        mockState.branchRows = [{ id: 'b1', businessDate: localKey(twoDaysAgo), isActive: true }];
        // Mirror the real service: a successful close advances the business date by one day.
        mockCloseDay.mockImplementation(async (_branchId: string, date: string) => {
            const next = new Date(`${date}T00:00:00.000Z`);
            next.setUTCDate(next.getUTCDate() + 1);
            mockState.branchRows[0].businessDate = next.toISOString().slice(0, 10);
            return { id: `report-${date}` };
        });
        const first = await runAutoCloseOnce(new Date());
        const second = await runAutoCloseOnce(new Date());
        expect(first.closed).toContain('b1');
        expect(second.closed).toEqual([]);
        expect(mockCloseDay).toHaveBeenCalledTimes(1);
    });
    it('still closes when WhatsApp send throws (warn-only notify)', async () => {
        enableAtMidnight();
        mockState.settingsRows = [
            { key: 'dayCloseAutoClose', value: { enabled: true, time: '00:00' } },
            { key: 'dayCloseWhatsappRecipients', value: ['+201012345678'] },
        ];
        vi.mocked(sendWhatsAppText).mockRejectedValueOnce(new Error('WA_DOWN'));
        const res = await runAutoCloseOnce(new Date());
        expect(res.closed).toContain('b1');
        expect(vi.mocked(sendWhatsAppText)).toHaveBeenCalled();
        expect(String((vi.mocked(sendWhatsAppText).mock.calls[0][0] as any)?.to)).toContain('201012345678');
        const events = vi.mocked(emitBranchEvent).mock.calls.map((c) => c[1]);
        expect(events).toContain('day-close:auto');
        expect(events).not.toContain('day-close:auto-failure');
    });
});

describe('day close auto-close status', () => {
    const seedClosed = (date: string, payload: any) => {
        mockState.auditRows = [{
            userId: 'admin-1',
            payload: { date, ...payload },
            createdAt: new Date(`${date}T23:59:00.000Z`),
        }];
    };
    it('returns override info for an AUTO_CLOSE date', async () => {
        const date = '2026-10-13';
        seedClosed(date, {
            overrideReason: 'AUTO_CLOSE scheduled 00:00',
            blockedReasons: ['OPEN_SHIFTS_EXIST_FOR_DAY_CLOSE'],
        });
        await expect(dayCloseService.getAutoCloseStatus('b1', date)).resolves.toEqual({
            overrideReason: 'AUTO_CLOSE scheduled 00:00',
            blockedReasons: ['OPEN_SHIFTS_EXIST_FOR_DAY_CLOSE'],
            closedBy: 'admin-1',
            closedAt: new Date(`${date}T23:59:00.000Z`),
        });
    });
    it('returns nulls for a normal close without override detail', async () => {
        const date = '2026-10-12';
        seedClosed(date, {});
        await expect(dayCloseService.getAutoCloseStatus('b1', date)).resolves.toEqual({
            overrideReason: null,
            blockedReasons: [],
            closedBy: 'admin-1',
            closedAt: new Date(`${date}T23:59:00.000Z`),
        });
        await expect(dayCloseService.getAutoCloseStatus('b1', '2026-01-01')).resolves.toBeNull();
    });
});
