import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    AUTH_SYNC_STORAGE_KEY,
    broadcastAuthEvent,
    makeAuthSyncEvent,
    subscribeAuthEvents,
    type AuthSyncEvent,
} from "../services/authSync";

type Listener = (event: any) => void;

const makeWindowStub = () => {
    const listeners = new Map<string, Listener[]>();
    const store = new Map<string, string>();
    const localStorage = {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => {
            store.set(k, v);
        },
        removeItem: (k: string) => {
            store.delete(k);
        },
    };
    const win: any = {
        localStorage,
        addEventListener: (type: string, fn: Listener) => {
            const list = listeners.get(type) || [];
            list.push(fn);
            listeners.set(type, list);
        },
        removeEventListener: (type: string, fn: Listener) => {
            listeners.set(type, (listeners.get(type) || []).filter((f) => f !== fn));
        },
        __fireStorage: (key: string, newValue: string | null) => {
            (listeners.get("storage") || []).forEach((fn) => fn({ key, newValue }));
        },
        __store: store,
    };
    return win;
};

const posted: AuthSyncEvent[][] = [];
class FakeChannel {
    static instances: FakeChannel[] = [];
    listeners: Listener[] = [];
    constructor(public name: string) {
        FakeChannel.instances.push(this);
    }
    postMessage = (msg: AuthSyncEvent) => {
        posted.push([msg]);
        FakeChannel.instances.forEach((ch) =>
            ch.listeners.forEach((fn) => fn({ data: msg })),
        );
    };
    addEventListener = (_t: string, fn: Listener) => {
        this.listeners.push(fn);
    };
    removeEventListener = (_t: string, fn: Listener) => {
        this.listeners = this.listeners.filter((f) => f !== fn);
    };
    close = () => {};
}

describe("cross-tab auth sync", () => {
    beforeEach(() => {
        posted.length = 0;
        FakeChannel.instances = [];
        vi.stubGlobal("BroadcastChannel", FakeChannel as any);
        vi.stubGlobal("window", makeWindowStub());
    });

    it("builds unique logout events with no credentials", () => {
        const a = makeAuthSyncEvent("logout");
        const b = makeAuthSyncEvent("logout");
        expect(a.type).toBe("logout");
        expect(a.nonce).not.toBe(b.nonce);
        expect(JSON.stringify(a)).not.toMatch(/token|password|cookie/i);
    });

    it("broadcast reaches channel and storage fallback", () => {
        const received: AuthSyncEvent[] = [];
        subscribeAuthEvents((e) => received.push(e));
        const evt = makeAuthSyncEvent("logout");
        broadcastAuthEvent(evt);
        expect(posted.flat()).toContainEqual(evt);
        expect((window as any).__store.get(AUTH_SYNC_STORAGE_KEY)).toContain(evt.nonce);
        expect(received).toContainEqual(evt);
    });

    it("dedupes channel+storage double delivery to a single handler call", () => {
        const received: AuthSyncEvent[] = [];
        subscribeAuthEvents((e) => received.push(e));
        const evt = makeAuthSyncEvent("session-expired", { code: "SESSION_EXPIRED" });
        broadcastAuthEvent(evt);
        (window as any).__fireStorage(AUTH_SYNC_STORAGE_KEY, JSON.stringify(evt));
        expect(received.filter((e) => e.nonce === evt.nonce)).toHaveLength(1);
    });

    it("ignores malformed payloads and unrelated keys", () => {
        const received: AuthSyncEvent[] = [];
        subscribeAuthEvents((e) => received.push(e));
        (window as any).__fireStorage(AUTH_SYNC_STORAGE_KEY, "not-json{{{");
        (window as any).__fireStorage("other-key", JSON.stringify(makeAuthSyncEvent("logout")));
        (window as any).__fireStorage(AUTH_SYNC_STORAGE_KEY, JSON.stringify({ type: "logout" }));
        expect(received).toHaveLength(0);
    });

    it("unsubscribe stops delivery and a throwing handler does not propagate", () => {
        const received: AuthSyncEvent[] = [];
        const off = subscribeAuthEvents(() => {
            throw new Error("consumer bug");
        });
        const off2 = subscribeAuthEvents((e) => received.push(e));
        const evt = makeAuthSyncEvent("logout");
        expect(() => (window as any).__fireStorage(AUTH_SYNC_STORAGE_KEY, JSON.stringify(evt))).not.toThrow();
        expect(received).toHaveLength(1);
        off();
        off2();
        (window as any).__fireStorage(AUTH_SYNC_STORAGE_KEY, JSON.stringify(makeAuthSyncEvent("logout")));
        expect(received).toHaveLength(1);
    });

    it("repeated identical logout events stay idempotent for consumers", () => {
        let calls = 0;
        subscribeAuthEvents(() => {
            calls += 1;
        });
        const evt = makeAuthSyncEvent("logout");
        broadcastAuthEvent(evt);
        broadcastAuthEvent(evt);
        expect(calls).toBe(1);
    });
});
