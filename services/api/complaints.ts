import { apiRequest } from './core';

export const complaintsApi = {
    list: () => apiRequest<any[]>('/marketing/complaints'),
    create: (data: { customerId: string; orderId?: string; subject: string; description: string; priority?: string }) =>
        apiRequest<any>('/marketing/complaints', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: { status?: string; assignedTo?: string; resolutionNotes?: string; priority?: string }) =>
        apiRequest<any>(`/marketing/complaints/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
};
