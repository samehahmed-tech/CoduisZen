export type LocalKdsEventKind = 'ORDER_UPSERTED' | 'STATUS_CHANGED';

export interface LocalKdsEvent {
    id: string;
    kind: LocalKdsEventKind;
    branchId: string;
    orderId: string;
    occurredAt: number;
}

const CHANNEL_NAME = 'restoflow-local-kds-v1';
const STORAGE_KEY = 'restoflow:local-kds:event';
const LOCAL_KDS_EVENT_TTL_MS = 24 * 60 * 60 * 1000;

export const createLocalKdsEvent = (kind: LocalKdsEventKind, branchId: string, orderId: string): LocalKdsEvent => ({
    id: `LOCAL-KDS-EVENT-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    kind,
    branchId: String(branchId || '').trim(),
    orderId: String(orderId || '').trim(),
    occurredAt: Date.now(),
});

export const isLocalKdsEventForBranch = (event: Partial<LocalKdsEvent>, branchId: string) =>
    Boolean(
        event?.id
        && event?.orderId
        && (event.kind === 'ORDER_UPSERTED' || event.kind === 'STATUS_CHANGED')
        && Number.isFinite(Number(event.occurredAt))
        && Math.abs(Date.now() - Number(event.occurredAt)) <= LOCAL_KDS_EVENT_TTL_MS
        && String(event.branchId || '').trim() === String(branchId || '').trim(),
    );

type LocalKdsEventHandler = (event: LocalKdsEvent) => void;

export const publishLocalKdsEvent = (event: LocalKdsEvent) => {
    if (!event.branchId || !event.orderId) return;
    try {
        const BroadcastChannelCtor = (globalThis as any).BroadcastChannel;
        if (typeof BroadcastChannelCtor === 'function') {
            const channel = new BroadcastChannelCtor(CHANNEL_NAME);
            channel.postMessage(event);
            channel.close();
        }
    } catch {
        // Storage fallback below remains available.
    }
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(event));
        }
    } catch {
        // Offline/local storage can be disabled; polling remains the fallback.
    }
};

export const subscribeLocalKds = (branchId: string, handler: LocalKdsEventHandler) => {
    const normalizedBranchId = String(branchId || '').trim();
    if (typeof window === 'undefined' || !normalizedBranchId) return () => undefined;
    const seen = new Set<string>();
    const deliver = (candidate: unknown) => {
        if (!candidate || typeof candidate !== 'object') return;
        const event = candidate as LocalKdsEvent;
        if (!isLocalKdsEventForBranch(event, normalizedBranchId) || seen.has(event.id)) return;
        seen.add(event.id);
        if (seen.size > 100) seen.delete(seen.values().next().value as string);
        handler(event);
    };

    let channel: any = null;
    try {
        const BroadcastChannelCtor = (globalThis as any).BroadcastChannel;
        if (typeof BroadcastChannelCtor === 'function') {
            channel = new BroadcastChannelCtor(CHANNEL_NAME);
            channel.addEventListener?.('message', (message: MessageEvent) => deliver(message.data));
        }
    } catch {
        channel = null;
    }
    const onStorage = (event: StorageEvent) => {
        if (event.key !== STORAGE_KEY || !event.newValue) return;
        try { deliver(JSON.parse(event.newValue)); } catch { /* ignore malformed local event */ }
    };
    window.addEventListener('storage', onStorage);

    return () => {
        channel?.close?.();
        window.removeEventListener('storage', onStorage);
    };
};
