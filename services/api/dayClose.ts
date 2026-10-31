import { apiRequest, apiRequestBlob } from './core';

const assertDayCloseOnline = () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        const error = new Error('DAY_CLOSE_REQUIRES_ONLINE') as Error & { code?: string };
        error.code = 'DAY_CLOSE_REQUIRES_ONLINE';
        throw error;
    }
};

export const dayCloseApi = {
    getReport: (branchId: string, date: string) => apiRequest<any>(`/day-close/${branchId}/${date}`),
    getPdf: (branchId: string, date: string, lang: 'ar' | 'en' = 'ar', paper: 'a4' | '80mm' = 'a4') => apiRequestBlob(`/day-close/${branchId}/${date}/pdf?lang=${lang}&paper=${paper}`),
    getXlsx: (branchId: string, date: string, lang: 'ar' | 'en' = 'ar') => apiRequestBlob(`/day-close/${branchId}/${date}/xlsx?lang=${lang}`),
    getHistory: (branchId: string, limit = 30) => apiRequest<any[]>(`/day-close/${branchId}/history?limit=${limit}`),
    updateBusinessDate: async (branchId: string, businessDate: string) => {
        assertDayCloseOnline();
        return apiRequest<{ success: boolean; businessDate: string }>(`/day-close/${branchId}/business-date`, {
            method: 'PUT',
            body: JSON.stringify({ businessDate }),
        });
    },
    close: async (branchId: string, date: string, payload?: {
        notes?: string;
        enforceShiftsClosed?: boolean;
        autoCloseOpenShifts?: boolean;
        overrideReason?: string;
        emailConfig?: any;
    }) => {
        assertDayCloseOnline();
        return apiRequest<{ success: boolean; message: string; report: any }>(`/day-close/${branchId}/${date}/close`, {
            method: 'POST',
            body: JSON.stringify(payload || {}),
        });
    },
    /** Reopen a wrongly-closed day (undo close; manager-only, reason required). */
    reopen: (branchId: string, date: string, reason: string) =>
        apiRequest<{ success: boolean; message: string; businessDate: string; previousBusinessDate: string; reopenedOrders: number; dateReverted: boolean }>(
            `/day-close/${branchId}/${date}/reopen`,
            { method: 'POST', body: JSON.stringify({ reason }) },
        ),
    sendEmail: (branchId: string, date: string, emailConfig: { to: string[]; cc?: string[]; subject: string; includeReports: Array<'sales' | 'payments' | 'audit'> }) =>
        apiRequest<{ success: boolean; message: string }>(`/day-close/${branchId}/${date}/send-email`, {
            method: 'POST',
            body: JSON.stringify({ emailConfig }),
        }),
};
