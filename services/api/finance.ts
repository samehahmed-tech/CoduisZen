import { apiRequest } from './core';

export const financeApi = {
    getAccounts: () => apiRequest<any[]>('/finance/accounts'),
    createExpenseAccount: (data: { name: string; nameAr?: string; code?: string }) =>
        apiRequest<any>('/finance/accounts/expense', { method: 'POST', body: JSON.stringify(data) }),
    getJournal: (limit?: number) => apiRequest<any[]>(`/finance/journal${limit ? `?limit=${limit}` : ''}`),
    createJournal: (data: { description: string; amount?: number; lines?: any[]; debitAccountCode?: string; creditAccountCode?: string; referenceId?: string; source?: string; metadata?: any; date?: string }) =>
        apiRequest<any>('/finance/journal', { method: 'POST', body: JSON.stringify(data) }),
    approveJournal: (id: string) => apiRequest<any>(`/finance/journal/${id}/approve`, { method: 'PUT' }),
    reverseJournal: (id: string, reason?: string) => apiRequest<any>(`/finance/journal/${id}/reverse`, { method: 'PUT', body: JSON.stringify({ reason }) }),
    getTrialBalance: () => apiRequest<{ accounts: any[]; totals: { debit: number; credit: number }; balanced: boolean }>('/finance/trial-balance'),
    getReconciliations: () => apiRequest<any[]>('/finance/reconciliations'),
    createReconciliation: (data: { accountCode: string; statementDate: string; statementBalance: number; notes?: string }) =>
        apiRequest<any>('/finance/reconciliations', { method: 'POST', body: JSON.stringify(data) }),
    resolveReconciliation: (id: string, data?: { adjustWithJournal?: boolean; adjustmentAccountCode?: string; notes?: string }) =>
        apiRequest<any>(`/finance/reconciliations/${id}/resolve`, { method: 'PUT', body: JSON.stringify(data || {}) }),
    getPeriodCloses: () => apiRequest<any[]>('/finance/period-closes'),
    closePeriod: (data: { periodStart: string; periodEnd: string }) =>
        apiRequest<any>('/finance/period-close', { method: 'POST', body: JSON.stringify(data) }),
    getProfitAndLoss: (params?: { start?: string; end?: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<any>(`/finance/statements/pnl${query ? `?${query}` : ''}`);
    },
    getBalanceSheet: (date?: string) =>
        apiRequest<any>(`/finance/statements/balance-sheet${date ? `?date=${date}` : ''}`),
    getCashFlow: (params?: { start?: string; end?: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<any>(`/finance/statements/cash-flow${query ? `?${query}` : ''}`);
    },
    getAccountsReceivable: () => apiRequest<any>('/finance/statements/ar'),
    getAccountsPayable: () => apiRequest<any>('/finance/statements/ap'),
    getExceptions: () => apiRequest<any[]>('/finance/exceptions'),
    resolveException: (id: string, action: 'RETRY' | 'DISMISS') =>
        apiRequest<any>(`/finance/exceptions/${id}/resolve`, { method: 'POST', body: JSON.stringify({ action }) }),
    getPostingRules: () => apiRequest<any[]>('/finance/mappings/rules'),
    createPostingRule: (data: any) => apiRequest<any>('/finance/mappings/rules', { method: 'POST', body: JSON.stringify(data) }),
    deletePostingRule: (id: string) => apiRequest<any>(`/finance/mappings/rules/${id}`, { method: 'DELETE' }),
};
