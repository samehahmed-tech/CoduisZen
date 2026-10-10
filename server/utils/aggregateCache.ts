/**
 * Tiny TTL cache for expensive read-only aggregates (dashboard KPIs, etc).
 * In-memory, bounded, key-scoped by the caller (branch + range + scope).
 * Freshness is explicit (45s default) and surfaced by clients via their
 * own "updated X ago" badges — never presented as guaranteed-current.
 * Mutations do not need invalidation: the window is shorter than any
 * operational review cycle that consumes these numbers.
 */

interface Entry {
    at: number;
    value: any;
}

const store = new Map<string, Entry>();
const MAX_KEYS = 300;

export const peekAggregate = (key: string, ttlMs: number): any | undefined => {
    const e = store.get(key);
    if (!e) return undefined;
    if (Date.now() - e.at > ttlMs) {
        store.delete(key);
        return undefined;
    }
    return e.value;
};

export const rememberAggregate = (key: string, value: any): void => {
    if (store.size >= MAX_KEYS) {
        // Evict oldest (Map preserves insertion order).
        const first = store.keys().next();
        if (!first.done) store.delete(first.value);
    }
    // Refresh recency on write.
    store.delete(key);
    store.set(key, { at: Date.now(), value });
};

export const DASHBOARD_KPI_TTL_MS = 45_000;
