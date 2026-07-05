import { apiRequest } from './core';

export const dayCloseApi = {
    getReport: (branchId: string, date: string) => apiRequest<any>(`/day-close/${branchId}/${date}`),
    getHistory: (branchId: string, limit = 30) => apiRequest<any[]>(`/day-close/${branchId}/history?limit=${limit}`),
    close: (branchId: string, date: string, payload?: {
        notes?: string;
        enforceFiscalClean?: boolean;
        enforceFinanceClean?: boolean;
        enforceShiftsClosed?: boolean;
        enforceAllPaid?: boolean;
        overrideReason?: string;
        emailConfig?: any;
    }) =>
        apiRequest<{ success: boolean; message: string; report: any }>(`/day-close/${branchId}/${date}/close`, {
            method: 'POST',
            body: JSON.stringify(payload || {}),
        }),
    sendEmail: (branchId: string, date: string, emailConfig: { to: string[]; cc?: string[]; subject: string; includeReports: Array<'sales' | 'payments' | 'audit'> }) =>
        apiRequest<{ success: boolean; message: string }>(`/day-close/${branchId}/${date}/send-email`, {
            method: 'POST',
            body: JSON.stringify({ emailConfig }),
        }),
};
