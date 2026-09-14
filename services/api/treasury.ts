import { apiRequest } from './core';

const branchQs = (branchId?: string) => (branchId ? `?branchId=${encodeURIComponent(branchId)}` : '');

export interface TreasuryVoucherInput {
    kind: 'RECEIPT' | 'PAYMENT';
    category:
        | 'SUPPLIER_PAYMENT' | 'SUPPLIER_ADVANCE' | 'EXPENSE'
        | 'CUSTODY_ISSUE' | 'CUSTODY_SETTLEMENT'
        | 'COLLECTION' | 'SALARY' | 'OTHER';
    accountId: string;
    amount: number;
    supplierId?: string;
    invoiceId?: string;
    holderUserId?: string;
    holderName?: string;
    expenseAccountCode?: string;
    description?: string;
    paymentMethod?: string;
    reference?: string;
}

export const treasuryApi = {
    overview: (branchId?: string) =>
        apiRequest<any>(`/finance/p1/treasury/overview${branchQs(branchId)}`),

    vouchers: (branchId?: string, filters?: { kind?: string; category?: string; status?: string; accountId?: string; limit?: number }) => {
        const q = new URLSearchParams();
        if (branchId) q.set('branchId', branchId);
        if (filters?.kind) q.set('kind', filters.kind);
        if (filters?.category) q.set('category', filters.category);
        if (filters?.status) q.set('status', filters.status);
        if (filters?.accountId) q.set('accountId', filters.accountId);
        if (filters?.limit) q.set('limit', String(filters.limit));
        const qs = q.toString();
        return apiRequest<any[]>(`/finance/p1/treasury/vouchers${qs ? `?${qs}` : ''}`);
    },

    createVoucher: (data: TreasuryVoucherInput) =>
        apiRequest<any>('/finance/p1/treasury/vouchers', { method: 'POST', body: JSON.stringify(data) }),

    approveVoucher: (id: string) =>
        apiRequest<any>(`/finance/p1/treasury/vouchers/${id}/approve`, { method: 'POST' }),

    rejectVoucher: (id: string) =>
        apiRequest<any>(`/finance/p1/treasury/vouchers/${id}/reject`, { method: 'POST' }),

    cancelVoucher: (id: string) =>
        apiRequest<any>(`/finance/p1/treasury/vouchers/${id}/cancel`, { method: 'POST' }),

    supplierStatement: (supplierId: string) =>
        apiRequest<any>(`/finance/p1/treasury/supplier-statement/${encodeURIComponent(supplierId)}`),

    custody: (branchId?: string) =>
        apiRequest<any[]>(`/finance/p1/treasury/custody${branchQs(branchId)}`),

    // ── Bank accounts & transfers (existing P1 backbone) ──
    bankAccounts: (branchId?: string) =>
        apiRequest<any[]>(`/finance/p1/bank-accounts${branchQs(branchId)}`),

    createBankAccount: (data: { name: string; accountType: 'BANK' | 'MOBILE_WALLET' | 'PETTY_CASH' | 'CASH_ON_HAND'; institution?: string; accountNumber?: string; openingBalance?: number }) =>
        apiRequest<any>('/finance/p1/bank-accounts', { method: 'POST', body: JSON.stringify(data) }),

    transfers: (branchId?: string) =>
        apiRequest<any[]>(`/finance/p1/transfers${branchQs(branchId)}`),

    requestTransfer: (data: { fromAccountId: string; toAccountId: string; amount: number; reason?: string }) =>
        apiRequest<any>('/finance/p1/transfers/request', { method: 'POST', body: JSON.stringify(data) }),

    approveTransfer: (id: string) =>
        apiRequest<any>(`/finance/p1/transfers/${id}/approve`, { method: 'POST' }),

    rejectTransfer: (id: string) =>
        apiRequest<any>(`/finance/p1/transfers/${id}/reject`, { method: 'POST' }),
};
