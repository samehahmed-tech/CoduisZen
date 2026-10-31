export const getPublicApiSandboxOrders = () => ({
    sandbox: true,
    data: [
        {
            id: 'sandbox-order-001', orderNumber: 'SANDBOX-001', branchId: 'sandbox',
            type: 'TAKEAWAY', source: 'PUBLIC_API_SANDBOX', status: 'COMPLETED',
            subtotal: 100, discount: 0, tax: 14, deliveryFee: 0, total: 114,
            isPaid: true, createdAt: '2026-01-01T10:00:00.000Z', updatedAt: '2026-01-01T10:05:00.000Z',
        },
        {
            id: 'sandbox-order-002', orderNumber: 'SANDBOX-002', branchId: 'sandbox',
            type: 'DINE_IN', source: 'PUBLIC_API_SANDBOX', status: 'PREPARING',
            subtotal: 80, discount: 5, tax: 10.5, deliveryFee: 0, total: 85.5,
            isPaid: false, createdAt: '2026-01-01T11:00:00.000Z', updatedAt: '2026-01-01T11:02:00.000Z',
        },
    ],
    paging: { limit: 2, nextCursor: null },
});
