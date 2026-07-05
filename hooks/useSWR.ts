import { useState, useEffect, useCallback } from 'react';

interface CacheItem<T> {
    data: T;
    timestamp: number;
}

const globalCache = new Map<string, CacheItem<any>>();
const mutationListeners = new Set<(key: string) => void>();

interface SWROptions<T> {
    revalidateOnFocus?: boolean;
    revalidateOnMount?: boolean;
    ttl?: number;
    initialData?: T;
}

export function useSWR<T>(
    key: string | null,
    fetcher: () => Promise<T>,
    options: SWROptions<T> = {}
) {
    const {
        revalidateOnFocus = true,
        revalidateOnMount = true,
        ttl = 5 * 60 * 1000, // 5 mins
        initialData
    } = options;

    const [data, setData] = useState<T | undefined>(() => {
        if (!key) return initialData;
        const cached = globalCache.get(key);
        if (cached && Date.now() - cached.timestamp < ttl) {
            return cached.data;
        }
        return initialData;
    });

    const [error, setError] = useState<Error | undefined>(undefined);
    const [isLoading, setIsLoading] = useState(!data && !!key);
    const [isValidating, setIsValidating] = useState(false);

    const revalidate = useCallback(async (force = false) => {
        if (!key) return;

        const cached = globalCache.get(key);
        const isStale = force || !cached || (Date.now() - cached.timestamp > ttl);

        if (!isStale) return;

        setIsValidating(true);
        try {
            const result = await fetcher();
            globalCache.set(key, { data: result, timestamp: Date.now() });
            setData(result);
            setError(undefined);
        } catch (err: any) {
            setError(err instanceof Error ? err : new Error(String(err)));
        } finally {
            setIsValidating(false);
            setIsLoading(false);
        }
    }, [key, fetcher, ttl]);

    // Initial mount & dependency change
    useEffect(() => {
        if (!key) {
            setIsLoading(false);
            return;
        }
        if (revalidateOnMount) {
            revalidate(true);
        }
    }, [key, revalidateOnMount, revalidate]);

    // Revalidate on window focus
    useEffect(() => {
        if (!revalidateOnFocus || !key) return;
        const onFocus = () => revalidate(true);
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, [key, revalidateOnFocus, revalidate]);

    // Listen for global mutates
    useEffect(() => {
        const listener = (mutatedKey: string) => {
            if (mutatedKey === key) {
                revalidate(true);
            }
        };
        mutationListeners.add(listener);
        return () => {
            mutationListeners.delete(listener);
        };
    }, [key, revalidate]);

    const mutateLocal = useCallback((newData: T | ((prev: T | undefined) => T), shouldRevalidate = true) => {
        if (!key) return;
        setData(prev => {
            const nextData = typeof newData === 'function' ? (newData as Function)(prev) : newData;
            globalCache.set(key, { data: nextData, timestamp: Date.now() });
            return nextData;
        });
        if (shouldRevalidate) {
            mutateGlobal(key); // Triggers revalidate across all hooks with this key
        }
    }, [key]);

    return { data, error, isLoading, isValidating, mutate: mutateLocal };
}

// Global mutate function to invalidate cache from anywhere
export const mutateGlobal = (key: string) => {
    globalCache.delete(key);
    mutationListeners.forEach(listener => listener(key));
};
