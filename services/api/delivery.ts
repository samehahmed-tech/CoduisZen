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
    getDailyOrderSummary: (params?: { branchId?: string; date?: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<any>(`/call-center/daily-summary${query ? `?${query}` : ''}`);
    },
};
