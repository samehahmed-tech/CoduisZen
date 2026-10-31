/**
 * Global webhook endpoints may receive global or branch events. A branch-bound
 * endpoint must have an explicit matching event branch; missing scope fails
 * closed so a caller cannot accidentally broadcast branch data.
 */
export const isWebhookBranchMatch = (endpointBranchId?: unknown, eventBranchId?: unknown) => {
    const endpointBranch = String(endpointBranchId || '').trim();
    if (!endpointBranch) return true;
    const eventBranch = String(eventBranchId || '').trim();
    return Boolean(eventBranch && eventBranch === endpointBranch);
};
