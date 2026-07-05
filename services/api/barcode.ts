import { apiRequest } from './core';

export const barcodeApi = {
    lookup: (code: string) =>
        apiRequest<{
            found: boolean;
            code?: string;
            type?: 'menu_item' | 'inventory_item';
            item?: any;
            matchField?: 'barcode' | 'sku';
        }>(`/barcode/lookup/${encodeURIComponent(code)}`),

    checkExists: (code: string, excludeId?: string, excludeType?: 'menu' | 'inventory') => {
        const params = new URLSearchParams();
        if (excludeId) params.set('excludeId', excludeId);
        if (excludeType) params.set('excludeType', excludeType);
        const qs = params.toString();
        return apiRequest<{
            exists: boolean;
            items: Array<{ id: string; name: string; type: string }>;
        }>(`/barcode/check/${encodeURIComponent(code)}${qs ? `?${qs}` : ''}`);
    },

    generate: () =>
        apiRequest<{ barcode: string; format: string }>('/barcode/generate'),

    lookupMenuItem: (code: string) =>
        apiRequest<{ found: boolean; item?: any; matchType?: string }>(`/barcode/menu/${encodeURIComponent(code)}`),

    lookupInventoryItem: (code: string) =>
        apiRequest<{ found: boolean; item?: any; matchType?: string }>(`/barcode/inventory/${encodeURIComponent(code)}`),
};
