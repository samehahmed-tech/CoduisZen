import { apiRequest, apiRequestBlob } from './core';

export const dayCloseApi = {
    getReport: (branchId: string, date: string) => apiRequest<any>(`/day-close/${branchId}/${date}`),
    getPdf: (branchId: string, date: string, lang: 'ar' | 'en' = 'ar', paper: 'a4' | '80mm' = 'a4') => apiRequestBlob(`/day-close/${branchId}/${date}/pdf?lang=${lang}&paper=${paper}`),
    getXlsx: (branchId: string, date: string, lang: 'ar' | 'en' = 'ar') => apiRequestBlob(`/day-close/${branchId}/${date}/xlsx?lang=${lang}`),
    getHistory: (branchId: string, limit = 30) => apiRequest<any[]>(`/day-close/${branchId}/history?limit=${limit}`),
    updateBusinessDate: (branchId: string, businessDate: string) => apiRequest<{ success: boolean; businessDate: string }>(`/day-close/${branchId}/business-date`, {
        method: 'PUT',
        body: JSON.stringify({ businessDate }),
    }),
    close: (branchId: string, date: string, payload?: {
        notes?: string;
        enforceShiftsClosed?: boolean;
        autoCloseOpenShifts?: boolean;
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
