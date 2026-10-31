export const summarizePaymentWebhookDeadLetter = (event: any) => {
    const payload = (event?.payload || {}) as Record<string, any>;
    return {
        id: event?.id,
        provider: String(payload.provider || 'UNKNOWN'),
        branchId: event?.branchId || null,
        retryCount: Number(payload.retryCount || 0),
        lastError: String(payload.lastError || 'UNKNOWN').slice(0, 300),
        createdAt: event?.createdAt,
        processedAt: event?.processedAt,
    };
};
