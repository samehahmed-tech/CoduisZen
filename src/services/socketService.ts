import { io, Socket } from 'socket.io-client';

type SocketEventHandler = (...args: any[]) => void;

const getSocketUrl = () => {
    const explicitSocketUrl = import.meta.env.VITE_SOCKET_URL;
    if (explicitSocketUrl && explicitSocketUrl.startsWith('http')) {
        return explicitSocketUrl;
    }

    const apiUrl = import.meta.env.VITE_API_URL;
    if (import.meta.env.DEV && ['3000', '5173'].includes(window.location.port)) {
        return `${window.location.protocol}//${window.location.hostname}:3001`;
    }
    if (!apiUrl) return window.location.origin;

    // Relative API path means we should always use same-origin socket endpoint.
    if (apiUrl.startsWith('/')) {
        return window.location.origin;
    }

    if (apiUrl.startsWith('http')) {
        try {
            const parsed = new URL(apiUrl);
            const currentHost = window.location.hostname;
            const apiHost = parsed.hostname;

            // Keep same-host absolute API URLs.
            if (apiHost === currentHost) {
                return parsed.origin;
            }

            // If API points to localhost while app is opened via LAN IP, use same-origin.
            const apiIsLocalhost = apiHost === 'localhost' || apiHost === '127.0.0.1';
            const appIsLocalhost = currentHost === 'localhost' || currentHost === '127.0.0.1';
            if (apiIsLocalhost && !appIsLocalhost) {
                return window.location.origin;
            }

            return parsed.origin;
        } catch {
            return window.location.origin;
        }
    }

    return window.location.origin;
};

class SocketService {
    private socket: Socket | null = null;
    private currentBranchId: string | null = null;
    private currentToken: string | null = null;
    private reconnectCallbacks: Set<() => void> = new Set();
    private connectionCallbacks: Set<(connected: boolean) => void> = new Set();
    private _wasConnected = false;

    init(token: string) {
        if (this.socket && this.currentToken === token) return;
        if (this.socket && this.currentToken !== token) {
            this.socket.disconnect();
            this.socket = null;
        }

        this.currentToken = token;
        this._wasConnected = false;
        this.socket = io(getSocketUrl(), {
            auth: { token },
            transports: ['websocket'],
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
        });

        this.socket.on('connect', () => {
            if (this.currentBranchId) {
                this.socket?.emit('join', this.currentBranchId);
            }
            // Fire reconnect callbacks only on RE-connections (not first connect)
            if (this._wasConnected) {
                this.reconnectCallbacks.forEach(cb => {
                    try { cb(); } catch { /* non-critical */ }
                });
            }
            this._wasConnected = true;
            this.connectionCallbacks.forEach(cb => cb(true));
        });
        this.socket.on('disconnect', () => {
            this.connectionCallbacks.forEach(cb => cb(false));
        });
    }

    joinBranch(branchId?: string) {
        if (!this.socket || !branchId) return;
        if (this.currentBranchId && this.currentBranchId !== branchId) {
            this.socket.emit('leave', this.currentBranchId);
        }
        this.currentBranchId = branchId;
        this.socket.emit('join', branchId);
    }

    on(event: string, handler: SocketEventHandler) {
        this.socket?.on(event, handler);
    }

    off(event: string, handler: SocketEventHandler) {
        this.socket?.off(event, handler);
    }

    /** Register a callback that fires only on RE-connections (after disconnect). */
    onReconnect(callback: () => void) {
        this.reconnectCallbacks.add(callback);
    }

    offReconnect(callback: () => void) {
        this.reconnectCallbacks.delete(callback);
    }

    onConnectionChange(callback: (connected: boolean) => void) {
        this.connectionCallbacks.add(callback);
        callback(this.isConnected());
    }

    offConnectionChange(callback: (connected: boolean) => void) {
        this.connectionCallbacks.delete(callback);
    }

    isConnected(): boolean {
        return this.socket?.connected ?? false;
    }

    disconnect() {
        this.socket?.disconnect();
        this.socket = null;
        this.currentBranchId = null;
        this.currentToken = null;
        this._wasConnected = false;
        this.reconnectCallbacks.clear();
        this.connectionCallbacks.clear();
    }
}

export const socketService = new SocketService();
export default socketService;
