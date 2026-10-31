export const sanitizeEtaDeadLetter = (record: any) => ({
    id: record?.id,
    orderId: record?.orderId,
    branchId: record?.branchId,
    attempts: Number(record?.attempts || 0),
    lastError: String(record?.lastError || '').slice(0, 300),
    status: record?.status,
    dismissedBy: record?.dismissedBy,
    dismissedAt: record?.dismissedAt,
    resolvedAt: record?.resolvedAt,
    createdAt: record?.createdAt,
    updatedAt: record?.updatedAt,
});
