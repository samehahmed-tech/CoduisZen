import logger from '../utils/logger';
import { EventEmitter } from 'events';

const log = logger.child({ domain: 'CacheService' });

export interface CacheOptions {
    ttlMs?: number; // Time to live in milliseconds
    staleWhileRevalidate?: boolean;
}

interface CacheEntry<T> {
    data: T;
    expiresAt: number;
    isFetching?: boolean;
}

/**
 * Advanced Memory/Redis-ready Cache Engine
 * Currently implements high-performance L1 LRU-style Memory Cache
 * that safely handles massive throughput without Redis network overhead.
 */
class DbCacheService extends EventEmitter {
    private cache = new Map<string, CacheEntry<any>>();
    private DEFAULT_TTL = 30 * 60 * 1000; // 30 minutes
    private MAX_ENTRIES = 1000; // Memory safety

    constructor() {
        super();
        // Background garbage collection to clear expired keys and free memory
        setInterval(() => this.sweep(), 5 * 60 * 1000).unref();
    }

    /**
     * Set a value in the cache.
     */
    set<T>(key: string, data: T, options?: CacheOptions) {
        if (this.cache.size >= this.MAX_ENTRIES) {
            this.sweep(true); // Force aggressive sweep
        }

        const expiresAt = Date.now() + (options?.ttlMs || this.DEFAULT_TTL);
        this.cache.set(key, { data, expiresAt });
    }

    /**
     * Invalidate (delete) a key. Use when data mutates.
     */
    invalidate(key: string) {
        this.cache.delete(key);
        log.debug({ key }, 'Cache invalidated');
        this.emit(`invalidated:${key}`);
    }

    /**
     * Invalidate multiple keys by a prefix pattern.
     */
    invalidatePattern(prefix: string) {
        let count = 0;
        for (const key of this.cache.keys()) {
            if (key.startsWith(prefix)) {
                this.cache.delete(key);
                count++;
            }
        }
        if (count > 0) log.debug({ prefix, count }, 'Cache pattern invalidated');
    }

    /**
     * Get or fetch. 
     * Core wrapper for controllers. If the key exists and is valid, returns it instantly.
     * If missing or expired, executes the fetchFactory callback, caches and returns the result.
     */
    async getOrFetch<T>(key: string, fetchFactory: () => Promise<T>, options?: CacheOptions): Promise<T> {
        const entry = this.cache.get(key);
        const now = Date.now();

        // HIT and valid
        if (entry && entry.expiresAt > now) {
            return entry.data;
        }

        // STALE (but user allowed stale-while-revalidate)
        if (entry && options?.staleWhileRevalidate) {
            // Revalidate in background without blocking
            if (!entry.isFetching) {
                entry.isFetching = true;
                fetchFactory().then(freshData => {
                    this.set(key, freshData, options);
                }).catch(err => {
                    log.error({ key, err: err.message }, 'Background cache revalidation failed');
                }).finally(() => {
                    if (this.cache.has(key)) {
                        this.cache.get(key)!.isFetching = false;
                    }
                });
            }
            return entry.data; // Return the fast, stale data immediately
        }

        // MISS or hard expired (block and fetch)
        const freshData = await fetchFactory();
        this.set(key, freshData, options);
        return freshData;
    }

    /**
     * Reclaims memory from expired keys or forces dropping oldest keys.
     */
    private sweep(force = false) {
        const now = Date.now();
        let deleted = 0;

        for (const [key, entry] of this.cache.entries()) {
            if (entry.expiresAt < now) {
                this.cache.delete(key);
                deleted++;
            }
        }

        if (force && this.cache.size >= this.MAX_ENTRIES) {
            // Memory is still too high, nuke the oldest 20%
            let toDelete = Math.floor(this.cache.size * 0.2);
            for (const key of this.cache.keys()) {
                this.cache.delete(key);
                deleted++;
                toDelete--;
                if (toDelete <= 0) break;
            }
        }

        if (deleted > 0) log.debug({ deleted }, 'Auto memory-sweep cleared cached entries');
    }
}

export const dbCacheService = new DbCacheService();

// trigger reload

// clear targets cache
