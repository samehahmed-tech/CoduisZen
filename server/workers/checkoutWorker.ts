import { Worker, Job } from 'bullmq';
import logger from '../utils/logger';
import IORedis from 'ioredis';

const redisUrl = process.env.REDIS_CACHE_URL || process.env.SOCKET_REDIS_URL;
const redisConnection = redisUrl ? new IORedis(redisUrl, { maxRetriesPerRequest: null }) : undefined;


const processCheckout = async (job: Job) => {
    logger.error({ orderId: job.data.orderId }, 'Checkout worker received a job, but checkout processing is handled synchronously by the order APIs.');
    throw new Error('CHECKOUT_WORKER_DISABLED');
};

export const startCheckoutWorker = () => {
    if (!redisConnection) {
        logger.info('Redis is not configured. Checkout Worker disabled.');
        return null;
    }

    const worker = new Worker('checkoutQueue', processCheckout, { connection: redisConnection });

    worker.on('completed', (job) => {
        logger.info(`${job.id} has completed!`);
    });

    worker.on('failed', (job, err) => {
        logger.error(`${job?.id} has failed with ${err.message}`);
    });

    logger.info('Checkout Worker started and listening to checkoutQueue.');
    return worker;
};
