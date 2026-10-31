import { apiRequest } from './core';

export type PublicQrMenu = {
    branch: { id: string; name?: string | null; nameAr?: string | null; currency?: string | null; channel: string; isOpen: boolean };
    categories: Array<{ id: string; name?: string | null; nameAr?: string | null }>;
    items: Array<{
        id: string;
        categoryId?: string | null;
        name: string;
        nameAr?: string | null;
        description?: string | null;
        descriptionAr?: string | null;
        price: number;
        image?: string | null;
        isPopular?: boolean | null;
        sizes?: Array<{ id: string; name?: string; nameAr?: string; price?: number }>;
        modifierGroups?: Array<{ id?: string; name?: string; nameAr?: string; minSelection?: number; maxSelection?: number; isRequired?: boolean; options?: Array<{ id: string; name?: string; nameAr?: string; price?: number }> }>;
    }>;
};

export const publicQrApi = {
    getMenu: (branchId: string, tableId: string, token: string) => apiRequest<PublicQrMenu>(
        `/v1/qr/branches/${encodeURIComponent(branchId)}/tables/${encodeURIComponent(tableId)}/menu?token=${encodeURIComponent(token)}`,
        { cache: 'no-store' },
    ),
    createOrder: (branchId: string, tableId: string, token: string, data: { items: Array<{ menuItemId: string; sizeId?: string; quantity: number; modifiers?: Array<{ id: string }> }>; customerName?: string; customerPhone?: string; notes?: string }) => apiRequest<{
        order: { id: string; orderNumber?: number | string; status?: string; total?: number; currency?: string };
        trackingUrl?: string | null;
    }>(`/v1/qr/branches/${encodeURIComponent(branchId)}/tables/${encodeURIComponent(tableId)}/orders`, {
        method: 'POST',
        headers: {
            'X-RestoFlow-QR-Token': token,
            'Idempotency-Key': globalThis.crypto?.randomUUID?.() || `qr-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        },
        body: JSON.stringify(data),
    }),
};
