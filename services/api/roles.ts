import { apiRequest } from './core';

interface RoleRecord {
    id: string;
    name: string;
    nameAr: string | null;
    description: string | null;
    descriptionAr: string | null;
    permissions: string[];
    isSystem: boolean;
    isActive: boolean;
    priority: number;
    color: string;
    icon: string;
    createdAt: string;
    updatedAt: string;
}

interface PermissionDefinition {
    id: string;
    key: string;
    name: string;
    nameAr: string | null;
    description: string | null;
    descriptionAr: string | null;
    category: string;
    categoryAr: string | null;
    subCategory: string | null;
    isActive: boolean;
    sortOrder: number;
}

export const rolesApi = {
    getAll: () => apiRequest<RoleRecord[]>('/roles'),

    getById: (id: string) => apiRequest<RoleRecord>(`/roles/${id}`),

    create: (data: {
        id: string;
        name: string;
        nameAr?: string;
        permissions?: string[];
        color?: string;
        icon?: string;
        isSystem?: boolean;
    }) => apiRequest<RoleRecord>('/roles', {
        method: 'POST',
        body: JSON.stringify(data),
    }),

    update: (id: string, data: Partial<{
        name: string;
        nameAr: string;
        permissions: string[];
        isActive: boolean;
        color: string;
        icon: string;
        priority: number;
    }>) => apiRequest<RoleRecord>(`/roles/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    }),

    delete: (id: string) => apiRequest<{ success: boolean }>(`/roles/${id}`, {
        method: 'DELETE',
    }),

    getPermissionDefinitions: () => apiRequest<PermissionDefinition[]>('/roles/permissions'),

    syncPermissions: () => apiRequest<{ synced: boolean; permissionDefinitions: number; roles: number }>('/roles/sync', {
        method: 'POST',
    }),
};
