export const PUBLIC_WEBHOOK_EVENTS = [
    'order.created', 'order.status_changed', 'order.completed', 'order.cancelled', 'order.refunded',
    'inventory.low_stock', 'inventory.stock_updated', 'inventory.batch_expired',
    'shift.opened', 'shift.closed', 'day.closed', 'driver.assigned', 'driver.location_updated',
    'payment.received', 'customer.created', 'customer.updated', 'fiscal.submitted', 'fiscal.failed',
    'approval.requested', 'approval.resolved',
] as const;

export const validatePublicWebhookInput = (body: any, allowedBranches: string[]) => {
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const url = typeof body?.url === 'string' ? body.url.trim() : '';
    const events: string[] = Array.isArray(body?.events)
        ? Array.from(new Set<string>(body.events.map((event: unknown) => String(event))))
        : [];
    const branchId = typeof body?.branchId === 'string' ? body.branchId.trim() : '';
    if (!name || name.length > 160) throw Object.assign(new Error('PUBLIC_WEBHOOK_NAME_INVALID'), { statusCode: 422 });
    if (!url) throw Object.assign(new Error('PUBLIC_WEBHOOK_URL_REQUIRED'), { statusCode: 422 });
    if (!events.length || events.some((event: string) => !(PUBLIC_WEBHOOK_EVENTS as readonly string[]).includes(event))) {
        throw Object.assign(new Error('PUBLIC_WEBHOOK_EVENT_INVALID'), { statusCode: 422 });
    }
    if (!branchId || (!allowedBranches.includes('*') && !allowedBranches.includes(branchId))) {
        throw Object.assign(new Error('PUBLIC_WEBHOOK_BRANCH_FORBIDDEN'), { statusCode: 403 });
    }
    const retryCount = Math.min(5, Math.max(1, Math.floor(Number(body?.retryCount || 3))));
    const timeoutMs = Math.min(30_000, Math.max(1_000, Math.floor(Number(body?.timeoutMs || 10_000))));
    return { name, url, events, branchId, retryCount, timeoutMs };
};
