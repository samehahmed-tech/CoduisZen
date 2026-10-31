import { createHash } from 'crypto';
import { aiLogger } from '../utils/logger';

export const recordAiRoute = (input: {
    userId?: string;
    branchId?: string;
    message?: string;
    route?: { providerId: string; modelId: string; usedFallback: boolean; latencyMs?: number };
}) => {
    if (!input.route) return;
    const messageHash = createHash('sha256').update(String(input.message || '')).digest('hex').slice(0, 16);
    aiLogger.info({
        userId: input.userId,
        branchId: input.branchId,
        messageHash,
        messageLength: String(input.message || '').length,
        providerId: input.route.providerId,
        modelId: input.route.modelId,
        usedFallback: input.route.usedFallback,
        latencyMs: input.route.latencyMs,
    }, 'AI route completed');
};
