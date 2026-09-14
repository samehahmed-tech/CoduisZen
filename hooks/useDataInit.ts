// Data Initialization Hook
// Loads data from API on app start

import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '../stores/useAuthStore';
import { useMenuStore } from '../stores/useMenuStore';
import { checkHealth } from '../services/api/core';
import { syncService } from '../services/syncService';
import { UserRole } from '../types';

interface InitResult {
    isLoading: boolean;
    isConnected: boolean;
    error: string | null;
}

export const useDataInit = (): InitResult => {
    const [isLoading, setIsLoading] = useState(true);
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { currentUser, fetchBranches, fetchPrinters, fetchSettings, fetchUsers, isAuthenticated, logout } = useAuthStore(
        useShallow((state) => ({
            currentUser: state.settings.currentUser,
            fetchBranches: state.fetchBranches,
            fetchPrinters: state.fetchPrinters,
            fetchSettings: state.fetchSettings,
            fetchUsers: state.fetchUsers,
            isAuthenticated: state.isAuthenticated,
            logout: state.logout,
        }))
    );
    const fetchMenu = useMenuStore((state) => state.fetchMenu);

    useEffect(() => {
        const onInvalidToken = () => {
            logout();
            setError('INVALID_TOKEN');
            setIsConnected(false);
        };

        window.addEventListener('coduiszen:auth-invalid', onInvalidToken as EventListener);
        return () => window.removeEventListener('coduiszen:auth-invalid', onInvalidToken as EventListener);
    }, [logout]);

    useEffect(() => {
        let cancelled = false;

        const initData = async () => {
            setIsLoading(true);
            setError(null);

            try {
                if (!isAuthenticated) {
                    if (!cancelled) {
                        setIsLoading(false);
                    }
                    return;
                }

                // Health probe runs CONCURRENTLY with essentials (it used to
                // block them) and is capped at 4s: a hanging /health must
                // never stall the shell. Essentials resolve from IndexedDB
                // cache on failure inside each fetcher.
                const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T | null> =>
                    Promise.race([
                        promise,
                        new Promise<null>((resolve) => window.setTimeout(() => resolve(null), ms)),
                    ]) as Promise<T | null>;

                // Essentials first: shell cannot render without branches/settings.
                // Menu catalog is heavy (API fetch + IndexedDB bulkPut) and is
                // NOT needed for first paint — it loads right after, off the
                // critical path. POS/Menu routes show their own loading state.
                const essentials: Promise<void>[] = [
                    fetchBranches(),
                    fetchSettings(),
                    fetchPrinters(),
                ];

                if (currentUser?.role === UserRole.SUPER_ADMIN) {
                    essentials.push(fetchUsers());
                }

                const [health] = await Promise.all([
                    withTimeout(checkHealth(), 4000),
                    Promise.allSettled(essentials),
                ]);
                const connected = health?.status === 'ok';

                if (!cancelled) {
                    setIsConnected(connected);
                }

                if (connected) {
                    syncService.syncPending();
                }

                const loadMenuSoon = () => {
                    void fetchMenu().catch(() => undefined);
                };
                if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
                    (window as unknown as { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback(loadMenuSoon, { timeout: 2500 });
                } else {
                    window.setTimeout(loadMenuSoon, 800);
                }
            } catch (err: any) {
                if (!cancelled) {
                    setError(err.message);
                    setIsConnected(false);
                }
            } finally {
                syncService.init();
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        };

        initData();

        return () => {
            cancelled = true;
        };
    }, [currentUser?.role, fetchBranches, fetchMenu, fetchPrinters, fetchSettings, fetchUsers, isAuthenticated]);

    return { isLoading, isConnected, error };
};

export const useSyncToDatabase = () => {
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastSync, setLastSync] = useState<Date | null>(null);
    const [error, setError] = useState<string | null>(null);

    const syncAuth = useAuthStore((state) => state.syncToDatabase);
    const syncMenu = useMenuStore((state) => state.syncToDatabase);

    const sync = async () => {
        setIsSyncing(true);
        setError(null);

        try {
            await Promise.all([
                syncAuth(),
                syncMenu(),
            ]);
            setLastSync(new Date());
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSyncing(false);
        }
    };

    return { sync, isSyncing, lastSync, error };
};

export default useDataInit;
