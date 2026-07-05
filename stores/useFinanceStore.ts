import { create } from 'zustand';
import { FinancialAccount, JournalEntry } from '../types';
import { financeApi } from '../services/api/finance';

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
}

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
            const [recsData, periodsData, accData, jrnData, tbData, excData] = await Promise.all([
                financeApi.getReconciliations(),
                financeApi.getPeriodCloses(),
                financeApi.getAccounts(),
                financeApi.getJournal(200),
                financeApi.getTrialBalance(),
                financeApi.getExceptions(),
            ]);

            const mappedAccounts: FinancialAccount[] = accData.map((a: any) => ({
                id: a.id,
                code: a.code,
                name: a.name,
                type: a.type,
                balance: Number(a.balance || 0),
                parentId: a.parentId,
            }));

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
                    debit: Number(tbData.totals?.debit || 0),
                    credit: Number(tbData.totals?.credit || 0),
                    balanced: Boolean(tbData.balanced),
                },
                reconciliations: recsData,
                periodCloses: periodsData,
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
