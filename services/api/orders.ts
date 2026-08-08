import { apiRequest } from './core';

type OrdersQuery = {
    status?: string;
    branch_id?: string;
    branchId?: string;
    type?: string;
    date?: string;
    from_date?: string;
    to_date?: string;
    startDate?: string;
    endDate?: string;
    source?: string;
    is_call_center_order?: boolean | string;
    limit?: number;
    cursor?: string;
};

type StatusUpdatePayload = {
    status: string;
    changed_by?: string;
    notes?: string;
    expected_updated_at?: string;
    expectedUpdatedAt?: string;
    approval_id?: number;
};

type IdempotentOptions = {
    idempotencyKey?: string;
};

export const ordersApi = {
    getAll: (params?: OrdersQuery) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<any[]>(`/orders${query ? `?${query}` : ''}`);
    },
    getById: (id: string) => apiRequest<any>(`/orders/${id}`),
    create: (order: any, options?: IdempotentOptions) => apiRequest<any>('/orders', {
        method: 'POST',
        body: JSON.stringify(order),
        ...(options?.idempotencyKey ? { headers: { 'Idempotency-Key': options.idempotencyKey } } : {}),
    }),
    updateStatus: (id: string, data: StatusUpdatePayload, options?: IdempotentOptions) =>
        apiRequest<any>(`/orders/${id}/status`, {
            method: 'PUT',
            body: JSON.stringify(data),
            ...(options?.idempotencyKey ? { headers: { 'Idempotency-Key': options.idempotencyKey } } : {}),
        }),
    updateCustomer: (id: string, data: any) =>
        apiRequest<any>(`/orders/${id}/customer`, {
            method: 'PUT',
            body: JSON.stringify(data),
        }),
    validateCoupon: (data: { code: string; branchId?: string; orderType: string; subtotal: number; customerId?: string }) =>
        apiRequest<{
            valid: boolean;
            message: string;
            code?: string;
            discountType?: 'PERCENT' | 'FIXED';
            discountValue?: number;
            discountAmount?: number;
            discountPercent?: number;
        }>('/orders/coupons/validate', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: string) => apiRequest<any>(`/orders/${id}`, { method: 'DELETE' }),
};
