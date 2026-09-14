import { AuditEventType } from '../types';

type EventCallback = (payload: any) => void;

class EventBus {
    private listeners: Map<string, EventCallback[]> = new Map();

    /**
     * Subscribe to a specific event
     */
    on(event: string | AuditEventType, callback: EventCallback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event)?.push(callback);

        // Return unsubscribe function
        return () => {
            const callbacks = this.listeners.get(event);
            if (callbacks) {
                this.listeners.set(event, callbacks.filter(cb => cb !== callback));
            }
        };
    }

    /**
     * Emit an event with payload
     */
    emit(event: string | AuditEventType, payload: any) {
        if (this.listeners.has(event)) {
            this.listeners.get(event)?.forEach(callback => {
                try {
                    callback(payload);
                } catch (error) {}
            });
        }
    }
}

export const eventBus = new EventBus();
