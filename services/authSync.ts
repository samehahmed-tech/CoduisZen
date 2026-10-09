/**
 * Cross-tab auth synchronization (same browser profile).
 *
 * Root cause it fixes: logout() only cleared the current tab. Sibling tabs
 * kept isAuthenticated=true with valid in-memory state until their next API
 * call failed with a raw AUTH_REQUIRED.
 *
 * Protocol: BroadcastChannel first, `storage` event fallback (fires in every
 * OTHER tab, never the writer — loop-free by construction). Payloads carry
 * NO credentials — just the event kind. Receivers never rebroadcast.
 *
 * Same-profile different-account tabs share localStorage tokens
 * (last-login-wins) — genuinely independent simultaneous accounts need
 * separate browser profiles; this module does not (and must not) try to
 * separate them.
 */

export const AUTH_SYNC_CHANNEL = 'coduiszen:auth-sync';
export const AUTH_SYNC_STORAGE_KEY = 'coduiszen:auth-event';

export type AuthSyncEvent =
    | { type: 'logout'; at: number; nonce: string }
    | { type: 'session-expired'; at: number; nonce: string; code: string };

export const makeAuthSyncEvent = (
    type: AuthSyncEvent['type'],
    extra?: { code?: string },
): AuthSyncEvent => ({
    type,
    at: Date.now(),
    nonce: `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`,
    ...(type === 'session-expired' ? { code: extra?.code || 'UNKNOWN' } : {}),
} as AuthSyncEvent);

const safeParse = (raw: string | null): AuthSyncEvent | null => {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as Partial<AuthSyncEvent>;
        if (!parsed || typeof parsed.nonce !== 'string') return null;
        if (parsed.type !== 'logout' && parsed.type !== 'session-expired') return null;
        return parsed as AuthSyncEvent;
    } catch {
        return null;
    }
};

/** Publish to sibling tabs. Never throws. No credentials inside. */
export const broadcastAuthEvent = (event: AuthSyncEvent): void => {
    try {
        if (typeof BroadcastChannel !== 'undefined') {
            new BroadcastChannel(AUTH_SYNC_CHANNEL).postMessage(event);
        }
    } catch {
        // channel unavailable — storage fallback below still delivers
    }
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(AUTH_SYNC_STORAGE_KEY, JSON.stringify(event));
        }
    } catch {
        // storage must never break logout
    }
};

export type AuthSyncUnsubscribe = () => void;

/**
 * Listen for sibling-tab auth events. The handler runs at most once per
 * nonce (dedupes channel+storage double delivery). Returns unsubscribe.
 */
export const subscribeAuthEvents = (handler: (event: AuthSyncEvent) => void): AuthSyncUnsubscribe => {
    const seen = new Set<string>();
    const cleanups: Array<() => void> = [];
    const emit = (event: AuthSyncEvent | null) => {
        if (!event || seen.has(event.nonce)) return;
        seen.add(event.nonce);
        // Bounded memory: keep only recent nonces.
        if (seen.size > 50) {
            const first = seen.values().next().value;
            if (first !== undefined) seen.delete(first);
        }
        try {
            handler(event);
        } catch {
            // a bad consumer must never break other listeners
        }
    };

    try {
        if (typeof BroadcastChannel !== 'undefined') {
            const channel = new BroadcastChannel(AUTH_SYNC_CHANNEL);
            const onMessage = (message: MessageEvent) => {
                const data = (message as MessageEvent)?.data;
                emit(data && typeof data.nonce === 'string' ? (data as AuthSyncEvent) : safeParse(typeof data === 'string' ? data : null));
            };
            channel.addEventListener('message', onMessage as EventListener);
            cleanups.push(() => {
                try {
                    channel.removeEventListener('message', onMessage as EventListener);
                } catch { /* ignore */ }
                try {
                    channel.close();
                } catch { /* ignore */ }
            });
        }
    } catch {
        // fall through to storage events only
    }

    try {
        if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
            const onStorage = (event: StorageEvent) => {
                if (!event || event.key !== AUTH_SYNC_STORAGE_KEY) return;
                emit(safeParse(event.newValue));
            };
            window.addEventListener('storage', onStorage);
            cleanups.push(() => {
                try {
                    window.removeEventListener('storage', onStorage);
                } catch { /* ignore */ }
            });
        }
    } catch {
        // non-browser runtimes simply get no events
    }

    return () => {
        cleanups.forEach((fn) => {
            try {
                fn();
            } catch { /* ignore */ }
        });
    };
};
