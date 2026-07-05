import { createClient, RedisClientType } from 'redis';
import logger from './logger';

let cacheClient: RedisClientType | null = null;
let isConnected = false;

export const initRedisCache = async () => {
    const redisEnabled = process.env.REDIS_CACHE_ENABLED === 'true' || process.env.SOCKET_REDIS_ENABLED === 'true';
    const redisUrl = process.env.REDIS_CACHE_URL || process.env.SOCKET_REDIS_URL;

    if (!redisEnabled || !redisUrl) {
        logger.info('Redis caching is disabled or not configured.');
        return;
    }

    try {
        cacheClient = createClient({ url: redisUrl });
        cacheClient.on('error', (err) => logger.error({ err }, 'Redis Cache Client Error'));
        await cacheClient.connect();
        isConnected = true;
        logger.info('Redis Cache initialized successfully.');
    } catch (error) {
        logger.error({ err: error }, 'Failed to initialize Redis Cache');
        isConnected = false;
        cacheClient = null;
    }
};

export const getCache = async (key: string): Promise<any | null> => {
    if (!isConnected || !cacheClient) return null;
    try {
        const data = await cacheClient.get(key);
        return data ? JSON.parse(String(data)) : null;
    } catch (error) {
        logger.error({ err: error }, `Redis get error for key: ${key}`);
        return null;
    }
};

export const setCache = async (key: string, value: any, ttlSeconds: number = 3600): Promise<boolean> => {
    if (!isConnected || !cacheClient) return false;
    try {
        await cacheClient.setEx(key, ttlSeconds, JSON.stringify(value));
        return true;
    } catch (error) {
        logger.error({ err: error }, `Redis set error for key: ${key}`);
        return false;
    }
};

export const clearCache = async (keyPrefix: string): Promise<void> => {
    if (!isConnected || !cacheClient) return;
    try {
        const keys = await cacheClient.keys(`${keyPrefix}*`);
        if (keys.length > 0) {
            await cacheClient.del(keys);
        }
    } catch (error) {
        logger.error({ err: error }, `Redis clear error for prefix: ${keyPrefix}`);
    }
};
