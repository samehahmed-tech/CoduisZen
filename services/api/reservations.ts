import { apiRequest } from './core';

const toQuery = (params?: Record<string, unknown>) => {
    const query = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
    });
    return query.toString();
};

export const reservationsApi = {
    list: (params: { branchId: string; date?: string }) => {
        const query = toQuery(params);
        return apiRequest<any[]>(`/reservations${query ? `?${query}` : ''}`);
    },
    create: (data: {
        branchId: string; customerName: string; customerPhone: string; partySize: number;
        date?: string; time: string; duration?: number; tableId?: string; customerId?: string;
        specialRequests?: string; notes?: string; source?: string;
    }) => apiRequest<any>('/reservations', { method: 'POST', body: JSON.stringify(data) }),
    setStatus: (id: string | number, status: 'CONFIRMED' | 'SEATED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW') =>
        apiRequest<any>(`/reservations/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
};

export const waitlistApi = {
    list: (branchId: string) =>
        apiRequest<any[]>(`/waitlist?branchId=${encodeURIComponent(branchId)}`),
    add: (data: { branchId: string; customerName: string; customerPhone?: string; partySize: number; quotedTimeMinutes?: number; notes?: string }) =>
        apiRequest<any>('/waitlist', { method: 'POST', body: JSON.stringify(data) }),
    setStatus: (id: string | number, status: string, tableId?: string) =>
        apiRequest<any>(`/waitlist/${id}`, { method: 'PUT', body: JSON.stringify({ status, tableId }) }),
};
