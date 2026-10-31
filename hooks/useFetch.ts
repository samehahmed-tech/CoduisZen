import { useState, useCallback, useEffect, useRef } from 'react';

interface UseFetchState<T> {
    data: T | null;
    loading: boolean;
    error: string | null;
}

interface UseFetchReturn<T> extends UseFetchState<T> {
    refetch: () => Promise<void>;
}

/**
 * Declarative data fetching hook with loading/error states and refetch.
 *
 * Usage:
 *   const { data, loading, error, refetch } = useFetch(() => api.getOrders(), [filters]);
 *
 *   if (loading) return <Spinner />;
 *   if (error) return <EmptyState type="data" title={error} />;
 */
export function useFetch<T>(
    fetcher: () => Promise<T>,
    deps: any[] = []
): UseFetchReturn<T> {
    const [state, setState] = useState<UseFetchState<T>>({ data: null, loading: true, error: null });
    const mountedRef = useRef(true);

    const fetchData = useCallback(async () => {
        setState(prev => ({ ...prev, loading: true, error: null }));
        try {
            const result = await fetcher();
            if (mountedRef.current) setState({ data: result, loading: false, error: null });
        } catch (err: any) {
            if (mountedRef.current) setState({ data: null, loading: false, error: err.message || 'Failed to fetch' });
        }
    }, deps);

    useEffect(() => {
        mountedRef.current = true;
        fetchData();
        return () => { mountedRef.current = false; };
    }, [fetchData]);

    return { ...state, refetch: fetchData };
}

export default useFetch;
