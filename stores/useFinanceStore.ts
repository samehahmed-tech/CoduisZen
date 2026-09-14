import { create } from 'zustand';
import { FinancialAccount, JournalEntry } from '../types';
import { financeApi } from '../services/api/finance';
import { shiftsApi } from '../services/api/shifts';

interface Shift {
    id: string;
    branchId: string;
    userId: string;
    status: 'OPEN' | 'CLOSED';
    openingBalance: number;
    openingTime: string;
    endTime?: string | null;
    expectedBalance?: number;
    actualBalance?: number;
}

interface FinanceState {
    accounts: FinancialAccount[];
    transactions: JournalEntry[];
    activeShift: Shift | null;
    isShiftDrawerOpen: boolean;
    isLoading: boolean;
    error: string | null;
    trialBalance: { debit: number; credit: number; balanced: boolean } | null;
    reconciliations: any[];
    periodCloses: any[];
    exceptions: any[];
    postingRules: any[];

    fetchFinanceData: () => Promise<void>;
    fetchPostingRules: () => Promise<void>;
    createPostingRule: (data: any) => Promise<void>;
    deletePostingRule: (id: string) => Promise<void>;
    recordTransaction: (tx: Omit<JournalEntry, 'id'>) => Promise<void>;
    createReconciliation: (payload: { accountCode: string; statementDate: string; statementBalance: number; notes?: string }) => Promise<void>;
    resolveReconciliation: (id: string, payload?: { adjustWithJournal?: boolean; adjustmentAccountCode?: string; notes?: string }) => Promise<void>;
    closePeriod: (payload: { periodStart: string; periodEnd: string }) => Promise<void>;
    resolveException: (id: string, action: 'RETRY' | 'DISMISS') => Promise<void>;
    approveJournal: (id: string) => Promise<void>;
    reverseJournal: (id: string, reason?: string) => Promise<void>;
    setShift: (shift: Shift | null) => void;
    setIsShiftDrawerOpen: (isOpen: boolean) => void;
    /** Re-fetch the OPEN shift for a branch. Only clears state on a
     * definitive "no shift" (404 / empty); transient failures (network,
     * timeout, 5xx, 401) keep the last known shift so the header never
     * flashes "no shift" while a shift is actually open. */
    refreshActiveShift: (branchId: string) => Promise<Shift | null>;
    lastShiftCheckAt: number | null;
    lastShiftCheckOk: boolean;
}

// In-flight dedup: one shared promise per branch so mount-time double
// fetches (POS sync + ShiftOverlays hydrate) don't race each other.
const shiftRefreshInflight = new Map<string, Promise<Shift | null>>();

const isDefinitiveNoShift = (error: any) => {
    const status = Number(error?.status);
    if (status === 404) return true;
    const code = String(error?.code || error?.message || '').toUpperCase();
    return code === 'NO_ACTIVE_SHIFT_FOUND' || code === 'HTTP_404';
};

export const useFinanceStore = create<FinanceState>((set, get) => ({
    accounts: [],
    transactions: [],
    activeShift: null,
    isShiftDrawerOpen: false,
    isLoading: false,
    error: null,
    trialBalance: null,
    reconciliations: [],
    periodCloses: [],
    exceptions: [],
    postingRules: [],

    setShift: (shift) => set({ activeShift: shift }),
    setIsShiftDrawerOpen: (isOpen) => set({ isShiftDrawerOpen: isOpen }),
    lastShiftCheckAt: null,
    lastShiftCheckOk: false,

    refreshActiveShift: async (branchId) => {
        const key = String(branchId || '').trim();
        if (!key) return get().activeShift;
        const pending = shiftRefreshInflight.get(key);
        if (pending) return pending;
        const run = (async () => {
            try {
                const res = await shiftsApi.getActive(key);
                if (res && res.id && String(res.status || '').toUpperCase() === 'OPEN') {
                    set({ activeShift: res as Shift, lastShiftCheckAt: Date.now(), lastShiftCheckOk: true });
                    return get().activeShift;
                }
                // Server answered but there is no OPEN shift — definitive.
                set({ activeShift: null, lastShiftCheckAt: Date.now(), lastShiftCheckOk: true });
                return null;
            } catch (error: any) {
                if (error?.name === 'AbortError' || error?.silent) return get().activeShift;
                if (isDefinitiveNoShift(error)) {
                    set({ activeShift: null, lastShiftCheckAt: Date.now(), lastShiftCheckOk: true });
                    return null;
                }
                // Transient failure — keep the last known shift untouched.
                set({ lastShiftCheckAt: Date.now(), lastShiftCheckOk: false });
                return get().activeShift;
            } finally {
                if (shiftRefreshInflight.get(key) === run) shiftRefreshInflight.delete(key);
            }
        })();
        shiftRefreshInflight.set(key, run);
        return run;
    },

    fetchPostingRules: async () => {
        try {
            const rules = await financeApi.getPostingRules();
            set({ postingRules: rules });
        } catch (error: any) {
            set({ error: error?.code || error?.message || 'FETCH_POSTING_RULES_FAILED' });
        }
    },

    createPostingRule: async (data) => {
        try {
            await financeApi.createPostingRule(data);
            await get().fetchPostingRules();
        } catch (error: any) {
            set({ error: error?.code || error?.message || 'CREATE_POSTING_RULE_FAILED' });
            throw error;
        }
    },

    deletePostingRule: async (id) => {
        try {
            await financeApi.deletePostingRule(id);
            await get().fetchPostingRules();
        } catch (error: any) {
            set({ error: error?.code || error?.message || 'DELETE_POSTING_RULE_FAILED' });
            throw error;
        }
    },

    fetchFinanceData: async () => {
        set({ isLoading: true, error: null });
        try {
            const results = await Promise.allSettled([
                financeApi.getReconciliations(),
                financeApi.getPeriodCloses(),
                financeApi.getAccounts(),
                financeApi.getJournal(200),
                financeApi.getTrialBalance(),
                financeApi.getExceptions(),
            ]);

            const valueOr = <T,>(index: number, fallback: T): T => {
                const result = results[index];
                return result?.status === 'fulfilled' ? result.value as T : fallback;
            };
            const recsData = valueOr(0, [] as any[]);
            const periodsData = valueOr(1, [] as any[]);
            const accData = valueOr(2, [] as any[]);
            const jrnData = valueOr(3, [] as any[]);
            const tbData = valueOr(4, { totals: { debit: 0, credit: 0 }, balanced: true });
            const excData = valueOr(5, [] as any[]);

            // The accounts endpoint returns a nested tree. Flatten it first,
            // then rebuild the local tree so child accounts are not dropped
            // by a root-only map operation.
            const flattenAccounts = (rows: any[], parentId: string | null = null): FinancialAccount[] => rows.flatMap((a: any) => {
                const account: FinancialAccount = {
                    id: a.id,
                    code: a.code,
                    name: a.name,
                    nameAr: a.nameAr,
                    type: a.type,
                    normalBalance: a.normalBalance,
                    isControlAccount: a.isControlAccount,
                    allowManualJournals: a.allowManualJournals !== false,
                    isActive: a.isActive !== false,
                    balance: Number(a.balance || 0),
                    parentId: a.parentId ?? parentId,
                };
                return [account, ...flattenAccounts(Array.isArray(a.children) ? a.children : [], account.id)];
            });
            const mappedAccounts = flattenAccounts(Array.isArray(accData) ? accData : []);

            // Convert flat accounts to tree for current finance UI component
            const byId = new Map(mappedAccounts.map(a => [a.id, { ...a, children: [] as FinancialAccount[] }]));
            const roots: FinancialAccount[] = [];
            byId.forEach(acc => {
                if (acc.parentId && byId.has(acc.parentId)) {
                    byId.get(acc.parentId)!.children!.push(acc);
                } else {
                    roots.push(acc);
                }
            });

            const mappedJournal: JournalEntry[] = jrnData.map((j: any) => ({
                id: j.id,
                date: new Date(j.date),
                description: j.description,
                debitAccountId: j.debitAccountCode,
                creditAccountId: j.creditAccountCode,
                amount: Number(j.amount || 0),
                referenceId: j.referenceId,
            }));

            set({
                accounts: roots,
                transactions: mappedJournal,
                trialBalance: {
                    debit: Number(tbData?.totals?.debit ?? 0),
                    credit: Number(tbData?.totals?.credit ?? 0),
                    balanced: Boolean(tbData?.balanced),
                },
                reconciliations: Array.isArray(recsData) ? recsData : [],
                periodCloses: Array.isArray(periodsData) ? periodsData : [],
                exceptions: excData,
                isLoading: false,
            });
        } catch (error: any) {
            set({ isLoading: false, error: error.message });
        }
    },

    recordTransaction: async (tx) => {
        try {
            await financeApi.createJournal({
                description: tx.description,
                amount: tx.amount,
                debitAccountCode: tx.debitAccountId,
                creditAccountCode: tx.creditAccountId,
                referenceId: tx.referenceId,
                source: 'MANUAL',
            });
            await get().fetchFinanceData();
        } catch (error: any) {
            set({ error: error.message });
            throw error;
        }
    },

    createReconciliation: async (payload) => {
        try {
            await financeApi.createReconciliation(payload);
            await get().fetchFinanceData();
        } catch (error: any) {
            set({ error: error.message });
            throw error;
        }
    },

    resolveReconciliation: async (id, payload) => {
        try {
            await financeApi.resolveReconciliation(id, payload);
            await get().fetchFinanceData();
        } catch (error: any) {
            set({ error: error.message });
            throw error;
        }
    },

    closePeriod: async (payload) => {
        try {
            await financeApi.closePeriod(payload);
            await get().fetchFinanceData();
        } catch (error: any) {
            set({ error: error.message });
            throw error;
        }
    },

    resolveException: async (id, action) => {
        try {
            await financeApi.resolveException(id, action);
            await get().fetchFinanceData();
        } catch (error: any) {
            set({ error: error.message });
            throw error;
        }
    },

    approveJournal: async (id) => {
        try {
            await financeApi.approveJournal(id);
            await get().fetchFinanceData();
        } catch (error: any) {
            set({ error: error.message });
            throw error;
        }
    },

    reverseJournal: async (id, reason) => {
        try {
            await financeApi.reverseJournal(id, reason);
            await get().fetchFinanceData();
        } catch (error: any) {
            set({ error: error.message });
            throw error;
        }
    },
}));
