import { apiRequest, apiRequestBlob } from './core';

export const usersApi = {
    getAll: () => apiRequest<any[]>('/users'),
    getById: (id: string) => apiRequest<any>(`/users/${id}`),
    create: (user: any) => apiRequest<any>('/users', { method: 'POST', body: JSON.stringify(user) }),
    update: (id: string, user: any) => apiRequest<any>(`/users/${id}`, { method: 'PUT', body: JSON.stringify(user) }),
    delete: (id: string) => apiRequest<any>(`/users/${id}`, { method: 'DELETE' }),
    bulkUpdateStatus: (userIds: string[], isActive: boolean) => apiRequest<any>('/users/bulk/update-status', { method: 'POST', body: JSON.stringify({ userIds, isActive }) }),
    bulkAssignRole: (userIds: string[], role: string) => apiRequest<any>('/users/bulk/assign-role', { method: 'POST', body: JSON.stringify({ userIds, role }) }),
    bulkAssignBranch: (userIds: string[], branchId: string) => apiRequest<any>('/users/bulk/assign-branch', { method: 'POST', body: JSON.stringify({ userIds, branchId }) }),
    exportCsv: () => apiRequestBlob('/users/export/csv'),
    getActiveSessions: () => apiRequest<any[]>('/users/sessions/active'),
    getAuditChanges: () => apiRequest<any[]>('/users/audit/user-changes'),
    revokeAllSessions: (id: string) => apiRequest<any>(`/users/${id}/sessions/revoke-all`, { method: 'POST' }),
    resetMfa: (id: string) => apiRequest<any>(`/users/${id}/mfa/reset`, { method: 'POST' }),
    resetPin: (id: string, newPin?: string) => apiRequest<any>(`/users/${id}/reset-pin`, { method: 'POST', body: JSON.stringify({ newPin }) }),
    resetPassword: (id: string, newPassword: string) => apiRequest<any>(`/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ newPassword }) }),
    toggleActive: (id: string) => apiRequest<any>(`/users/${id}/toggle-active`, { method: 'POST' }),
    updatePermissions: (id: string, permissions: string[]) => apiRequest<any>(`/users/${id}/permissions`, { method: 'PUT', body: JSON.stringify({ permissions }) }),
    updateBranchAccess: (id: string, assignedBranchId?: string, allowedBranches?: string[]) => apiRequest<any>(`/users/${id}/branch-access`, { method: 'PUT', body: JSON.stringify({ assignedBranchId, allowedBranches }) }),
    getEffectivePermissions: (id: string) => apiRequest<any>(`/users/${id}/effective-permissions`),
};
