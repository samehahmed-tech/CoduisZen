import { apiRequest } from './core';

export const deliveryApi = {
    getZones: (branchId?: string) => apiRequest<any[]>(`/delivery/zones${branchId ? `?branchId=${branchId}` : ''}`),
    createZone: (data: any) => apiRequest<any>('/delivery/zones', { method: 'POST', body: JSON.stringify(data) }),
    updateZone: (id: number | string, data: any) => apiRequest<any>(`/delivery/zones/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteZone: (id: number | string) => apiRequest<any>(`/delivery/zones/${id}`, { method: 'DELETE' }),
    getAvailableDrivers: (branchId?: string) => apiRequest<any[]>(`/delivery/drivers${branchId ? `?branchId=${branchId}` : ''}`),
    getDrivers: (params?: { branchId?: string; status?: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<any[]>(`/delivery/drivers/all${query ? `?${query}` : ''}`);
    },
    createDriver: (data: {
        name: string;
        phone: string;
        branchId: string;
        email?: string;
        password?: string;
        pin?: string;
        createLogin?: boolean;
        status?: string;
    }) => apiRequest<any>('/delivery/drivers', { method: 'POST', body: JSON.stringify(data) }),
    updateDriver: (id: string, data: { name?: string; phone?: string; branchId?: string; status?: string; isActive?: boolean }) =>
        apiRequest<any>(`/delivery/drivers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    getTelemetry: (branchId?: string) => apiRequest<Array<{
        driverId: string;
        branchId?: string | null;
        lat: number;
        lng: number;
        speedKmh?: number;
        accuracy?: number;
        updatedAt: string;
    }>>(`/delivery/telemetry${branchId ? `?branchId=${branchId}` : ''}`),
    updateDriverLocation: (id: string, data: { lat: number; lng: number; speedKmh?: number; accuracy?: number }) =>
        apiRequest<any>(`/delivery/drivers/${id}/location`, { method: 'PUT', body: JSON.stringify(data) }),
    getSlaAlerts: (params?: { branchId?: string; delayMinutes?: number; staleLocationMinutes?: number }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<{ branchId: string; total: number; alerts: any[] }>(`/delivery/sla-alerts${query ? `?${query}` : ''}`);
    },
    autoEscalateSlaAlerts: (data?: { branchId?: string; delayMinutes?: number; staleLocationMinutes?: number }) =>
        apiRequest<{ scanned: number; escalated: number; branchId: string; escalations: any[] }>(
            '/delivery/sla-alerts/escalate',
            { method: 'POST', body: JSON.stringify(data || {}) }
        ),
    assign: (data: { orderId: string; driverId: string }) => apiRequest<any>('/delivery/assign', { method: 'POST', body: JSON.stringify(data) }),
    updateDriverStatus: (id: string, status: string) => apiRequest<any>(`/delivery/drivers/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
    /** Pilot cash account: balance, today stats, ledger history, completed orders. */
    getMyCash: () => apiRequest<any>('/delivery/my-cash'),
    /** Branch review of one pilot's cash account. */
    getDriverCash: (id: string) => apiRequest<any>(`/delivery/drivers/${id}/cash`),
    /** Branch collects cash from the pilot (defaults to full balance). */
    settleDriverCash: (id: string, data?: { amount?: number; notes?: string }) =>
        apiRequest<{ success: boolean; settled: number; remaining: number; driverId: string; driverName: string }>(
            `/delivery/drivers/${id}/settle`, { method: 'POST', body: JSON.stringify(data || {}) }),
    /** Pilot taps "I'm back at the branch" — needs branch approval. */
    requestCheckin: (notes?: string) =>
        apiRequest<any>('/delivery/checkin/request', { method: 'POST', body: JSON.stringify({ notes: notes || '' }) }),
    /** Branch inbox of return requests. */
    getCheckins: (status = 'REQUESTED') => apiRequest<any[]>(`/delivery/checkins?status=${status}`),
    approveCheckin: (id: string, notes?: string) =>
        apiRequest<any>(`/delivery/checkin/${id}/approve`, { method: 'POST', body: JSON.stringify({ notes: notes || '' }) }),
    rejectCheckin: (id: string, notes?: string) =>
        apiRequest<any>(`/delivery/checkin/${id}/reject`, { method: 'POST', body: JSON.stringify({ notes: notes || '' }) }),
    getMyAssignments: () => apiRequest<any[]>('/delivery/my-assignments'),
    /** Confirm pickup: READY/ASSIGNED -> OUT_FOR_DELIVERY + driver BUSY. */
    pickupOrder: (id: string) => apiRequest<any>(`/delivery/orders/${id}/pickup`, { method: 'PUT' }),
    /** Confirm delivery with proof-of-collection when cash is due. */
    deliverOrder: (id: string, data?: { cashCollected?: number; notes?: string; deliveryOtp?: string; managerPin?: string }) =>
        apiRequest<any>(`/delivery/orders/${id}/deliver`, { method: 'PUT', body: JSON.stringify(data || {}) }),
    /** Report a failed delivery — order returns to the dispatch queue. */
    failDelivery: (id: string, reason: string) =>
        apiRequest<any>(`/delivery/orders/${id}/fail`, { method: 'PUT', body: JSON.stringify({ reason }) }),
};

export const callCenterSupervisorApi = {
    getEscalations: (params?: { status?: 'OPEN' | 'RESOLVED'; branchId?: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<any[]>(`/call-center/escalations${query ? `?${query}` : ''}`);
    },
    createEscalation: (data: { orderId: string; branchId?: string; priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; reason: string; notes?: string; assignedTo?: string }) =>
        apiRequest<any>('/call-center/escalations', { method: 'POST', body: JSON.stringify(data) }),
    scanEscalations: (data?: { thresholdMinutes?: number; branchId?: string }) =>
        apiRequest<{ scanned: number; created: number; thresholdMinutes: number; branchId: string; escalations: any[] }>(
            '/call-center/escalations/scan',
            { method: 'POST', body: JSON.stringify(data || {}) },
        ),
    resolveEscalation: (id: string, resolutionNotes?: string) =>
        apiRequest<any>(`/call-center/escalations/${id}/resolve`, { method: 'PUT', body: JSON.stringify({ resolutionNotes }) }),
    getCoachingNotes: (params?: { agentId?: string; branchId?: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<any[]>(`/call-center/coaching-notes${query ? `?${query}` : ''}`);
    },
    addCoachingNote: (data: { agentId: string; branchId?: string; note: string; tags?: string[] }) =>
        apiRequest<any>('/call-center/coaching-notes', { method: 'POST', body: JSON.stringify(data) }),
    getDiscountAbuse: (params?: { branchId?: string; startDate?: string; endDate?: string; thresholdPercent?: number; thresholdAmount?: number }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<any>(`/call-center/discount-abuse${query ? `?${query}` : ''}`);
    },
    approveDiscountViolation: (data: { orderId: string; agentId?: string; branchId?: string; status?: 'APPROVED' | 'REJECTED'; reason?: string }) =>
        apiRequest<any>('/call-center/discount-abuse/approve', { method: 'POST', body: JSON.stringify(data) }),

    // Advanced scenarios
    getBranchHealth: () =>
        apiRequest<{ checkedAt: string; branches: any[]; summary: { total: number; online: number; offline: number; unknown: number } }>('/call-center/branch-health'),
    getFailedOrders: (params?: { branchId?: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<{ total: number; orders: any[] }>(`/call-center/failed-orders${query ? `?${query}` : ''}`);
    },
    retryFailedOrder: (orderId: string) =>
        apiRequest<{ success: boolean; orderId: string; syncStatus: string }>(`/call-center/failed-orders/${orderId}/retry`, { method: 'PUT' }),
    retryAllFailedOrders: (params?: { branchId?: string }) =>
        apiRequest<{ success: boolean; retried: number; failed: string[]; total: number }>('/call-center/failed-orders/retry-all', { method: 'POST', body: JSON.stringify(params || {}) }),
    getDailyOrderSummary: (params?: { branchId?: string; date?: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<any>(`/call-center/daily-summary${query ? `?${query}` : ''}`);
    },
};
