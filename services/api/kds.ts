import { apiRequest } from './core'; // Bust Vite HMR Cache

export const kdsApi = {
    getMeta: (branchId?: string) => {
        const suffix = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
        return apiRequest<{ stations: Array<{ name: string }>; source: string }>(`/kds/meta${suffix}`);
    },

    getTickets: (params?: { station?: string; branchId?: string; includeServed?: boolean }) => {
        const query = new URLSearchParams();
        if (params?.station) query.set('station', params.station);
        if (params?.branchId) query.set('branchId', params.branchId);
        if (params?.includeServed) query.set('includeServed', 'true');
        const suffix = query.toString() ? `?${query.toString()}` : '';
        return apiRequest<any>(`/kds${suffix}`);
    },

    dispatchOrder: (orderId: string, branchId: string, clientHandlesPrinting = false) =>
        apiRequest<any>('/kds/dispatch', {
            method: 'POST',
            body: JSON.stringify({ orderId, branchId, clientHandlesPrinting }),
        }),
    
    bumpTicket: (id: string) => 
        apiRequest<any>(`/kds/${id}/bump`, { method: 'POST' }),

    handoverOrder: (orderId: string) =>
        apiRequest<any>(`/kds/orders/${orderId}/handover`, { method: 'POST' }),
        
    recallTicket: (id: string) => 
        apiRequest<any>(`/kds/${id}/recall`, { method: 'POST' }),
        
    toggleItem: (ticketId: string, itemId: number) => 
        apiRequest<any>(`/kds/${ticketId}/items/${itemId}/toggle`, { method: 'PUT' }),
};
