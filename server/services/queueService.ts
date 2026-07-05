import { Queue } from 'bullmq';
import logger from '../utils/logger';

import IORedis from 'ioredis';

const redisUrl = process.env.REDIS_CACHE_URL || process.env.SOCKET_REDIS_URL;
const redisConnection = redisUrl ? new IORedis(redisUrl, { maxRetriesPerRequest: null }) : undefined;

export const checkoutQueue = redisConnection ? new Queue('checkoutQueue', {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
        removeOnFail: false
    }
}) : null;


export const addCheckoutTask = async (orderId: string, payload: any) => {
    if (!checkoutQueue) {
        logger.warn({ orderId }, 'Checkout queue disabled; order checkout side effects are handled synchronously.');
        return null;
    }

    try {
        await checkoutQueue.add('processCheckout', { orderId, payload });
        logger.info(`Added checkout task for order ${orderId} to queue.`);
    } catch (error) {
        logger.error({ err: error }, `Failed to add checkout task for order ${orderId}`);
    }
};

export const getCheckoutQueueHealth = async () => {
    if (!redisConnection) {
        return {
            ok: true,
            mode: 'disabled',
            redisConfigured: false,
            counts: {
                waiting: 0,
                active: 0,
                completed: 0,
                failed: 0,
                delayed: 0,
                paused: 0,
            },
        };
    }

    const counts = await checkoutQueue.getJobCounts(
        'waiting',
        'active',
        'completed',
        'failed',
        'delayed',
        'paused',
    );

    return {
        ok: redisConnection.status === 'ready',
        mode: 'bullmq',
        redisConfigured: true,
        redisStatus: redisConnection.status,
        counts,
    };
};
