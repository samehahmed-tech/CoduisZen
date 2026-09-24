import { apiRequest } from './core';

export interface ButcheryOutputPayload {
    itemId?: string;
    quantity: number;
    unit: string;
    outputType: 'USABLE' | 'BY_PRODUCT' | 'WASTE';
    warehouseId?: string;
    wasteReason?: string;
}

export const butcheryApi = {
    list: (params?: { status?: string; branchId?: string; sourceItemId?: string }) => {
        const query = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => Boolean(v)) as string[][]).toString();
        return apiRequest<any[]>(`/butchery/operations${query ? `?${query}` : ''}`);
    },
    get: (id: string) => apiRequest<any>(`/butchery/operations/${id}`),
    create: (data: {
        sourceItemId: string;
        sourceQty: number;
        sourceUnit?: string;
        warehouseId: string;
        templateId?: string;
        notes?: string;
        wasteReason?: string;
        outputs: ButcheryOutputPayload[];
    }) => apiRequest<any>('/butchery/operations', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: { sourceItemId?: string; sourceQty?: number; notes?: string | null; wasteReason?: string | null; outputs?: ButcheryOutputPayload[] }) =>
        apiRequest<any>(`/butchery/operations/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id: string) => apiRequest<any>(`/butchery/operations/${id}`, { method: 'DELETE' }),
    post: (id: string) => apiRequest<any>(`/butchery/operations/${id}/post`, { method: 'POST' }),
    cancel: (id: string) => apiRequest<any>(`/butchery/operations/${id}/cancel`, { method: 'POST' }),
    templates: () => apiRequest<any[]>('/butchery/templates'),
    createTemplate: (data: { name: string; sourceItemId: string; branchId?: string; lines: { itemId?: string; expectedPct: number; outputType: string; unit?: string }[] }) =>
        apiRequest<any>('/butchery/templates', { method: 'POST', body: JSON.stringify(data) }),
    deleteTemplate: (id: string) => apiRequest<any>(`/butchery/templates/${id}`, { method: 'DELETE' }),
    yieldReport: (params?: { branchId?: string; sourceItemId?: string; startDate?: string; endDate?: string }) => {
        const query = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => Boolean(v)) as string[][]).toString();
        return apiRequest<any>(`/butchery/yield-report${query ? `?${query}` : ''}`);
    },
};
