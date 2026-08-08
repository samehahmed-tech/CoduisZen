export const branchEntityCacheKey = (branchId: string, entityId: string) => `${branchId}::${entityId}`;

export const toBranchEntityCache = <T extends { id: string }>(entity: T, branchId: string) => ({
    ...entity,
    id: branchEntityCacheKey(branchId, entity.id),
    entityId: entity.id,
    branchId,
});

export const fromBranchEntityCache = <T extends { id: string; entityId?: string }>(entity: T) => ({
    ...entity,
    id: entity.entityId || entity.id,
});
