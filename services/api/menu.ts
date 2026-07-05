import { apiRequest } from './core';

export const menuApi = {
    getCategories: () => apiRequest<any[]>('/menu/categories'),
    createCategory: (category: any) => apiRequest<any>('/menu/categories', { method: 'POST', body: JSON.stringify(category) }),
    updateCategory: (id: string, category: any) => apiRequest<any>(`/menu/categories/${id}`, { method: 'PUT', body: JSON.stringify(category) }),
    deleteCategory: (id: string) => apiRequest<any>(`/menu/categories/${id}`, { method: 'DELETE' }),
    getItems: (categoryId?: string) => {
        const query = categoryId ? `?category_id=${categoryId}` : '';
        return apiRequest<any[]>(`/menu/items${query}`);
    },
    getItemById: (id: string) => apiRequest<any>(`/menu/items/${id}`),
    createItem: (item: any) => apiRequest<any>('/menu/items', { method: 'POST', body: JSON.stringify(item) }),
    updateItem: (id: string, item: any) => apiRequest<any>(`/menu/items/${id}`, { method: 'PUT', body: JSON.stringify(item) }),
    deleteItem: (id: string) => apiRequest<any>(`/menu/items/${id}`, { method: 'DELETE' }),
    getFullMenu: (availableOnly?: boolean) => apiRequest<any[]>(`/menu/full${availableOnly ? '?available_only=true' : ''}`),
    importItems: (payload: {
        rows?: Record<string, any>[];
        sizesRows?: Record<string, any>[];
        modifierRows?: Record<string, any>[];
        recipeRows?: Record<string, any>[];
        csvData?: string;
        updateExisting?: boolean;
        menuId?: string;
        dryRun?: boolean;
    }) =>
        apiRequest<any>('/menu/items/import', { method: 'POST', body: JSON.stringify(payload) }),
};
