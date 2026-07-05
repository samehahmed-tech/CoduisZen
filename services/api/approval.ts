import { apiRequest } from './core';

export const approvalsApi = {
    getAll: (branchId?: string) =>
        apiRequest<any[]>(`/approvals${branchId ? `?branchId=${branchId}` : ''}`),
    create: (approval: any) =>
        apiRequest<any>('/approvals', { method: 'POST', body: JSON.stringify(approval) }),
    verifyPin: (data: { branchId: string; pin: string; action: string }) =>
        apiRequest<{ approved: boolean; managerId?: string; managerName?: string; error?: string }>(
            '/approvals/verify-pin',
            { method: 'POST', body: JSON.stringify(data) }
        ),
};

export const approvalApi = {
    getAll: (branchId?: string) => apiRequest<any[]>(`/approvals${branchId ? `?branchId=${branchId}` : ''}`),
    create: (data: { type: string; referenceId: string; details?: any }) =>
        apiRequest<any>('/approvals', { method: 'POST', body: JSON.stringify(data) }),
    verifyPin: (data: { pin: string; approvalId?: string; branchId?: string }) =>
        apiRequest<any>('/approvals/verify-pin', { method: 'POST', body: JSON.stringify(data) }),
    reject: (approvalId: string, data?: { reason?: string }) =>
        apiRequest<any>(`/approvals/${approvalId}/reject`, { method: 'PUT', body: JSON.stringify(data || {}) }),
};
