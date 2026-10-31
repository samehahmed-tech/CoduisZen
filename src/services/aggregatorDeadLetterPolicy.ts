export type AggregatorDeadLetterMetadata = {
    id: number;
    providerId: string;
    externalId: string;
    branchId: string | null;
    providerStatus: string;
    status: string;
    attempt: number;
    error: string | null;
    createdAt: unknown;
    nextRetryAt: unknown;
};

export const sanitizeAggregatorDeadLetter = (row: any): AggregatorDeadLetterMetadata => {
    const envelope = row?.payload && typeof row.payload === 'object' && !Array.isArray(row.payload) ? row.payload : {};
    return {
        id: Number(row?.id),
        providerId: String(envelope.provider || ''),
        externalId: String(envelope.orderId || envelope.externalId || ''),
        branchId: envelope.branchId ? String(envelope.branchId) : null,
        providerStatus: String(envelope.status || ''),
        status: String(row?.status || ''),
        attempt: Number(row?.attempt || 1),
        error: row?.lastError || null,
        createdAt: row?.createdAt || null,
        nextRetryAt: row?.nextRetryAt || null,
    };
};

export const canReplayAggregatorDeadLetter = (metadata: Pick<AggregatorDeadLetterMetadata, 'branchId'>, effectiveBranchId?: string) => (
    !effectiveBranchId || metadata.branchId === effectiveBranchId
);
