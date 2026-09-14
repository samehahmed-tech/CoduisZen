import { create } from 'zustand';
import { kdsApi } from '../services/api/kds';

interface KdsItem {
    id: number;
    kdsTicketId: string;
    itemName: string;
    quantity: number;
    modifiersText: string | null;
    modifiers?: any;
    selectedModifiers?: any;
    sizeLabel?: string | null;
    size?: string | null;
    notes?: string | null;
    itemNotes?: string | null;
    isBumped?: boolean;
}

export interface KdsTicket {
    id: string;
    branchId: string;
    orderId: string;
    orderNumber?: number | string | null;
    type?: string | null;
    tableId?: string | null;
    tableName?: string | null;
    kitchenNotes?: string | null;
    routingStation: string;
    status: 'PENDING' | 'PREPARING' | 'READY' | 'SERVED' | 'DELIVERED' | 'CANCELLED';
    priority: 'NORMAL' | 'RUSH' | 'REMAKE';
    createdAt: string;
    bumpedAt: string | null;
    items: KdsItem[];
}

export const compareKdsTicketPriority = (
    a: Pick<KdsTicket, 'priority' | 'createdAt'>,
    b: Pick<KdsTicket, 'priority' | 'createdAt'>,
) => {
    const priorityGroup = (priority: KdsTicket['priority']) => priority === 'RUSH' || priority === 'REMAKE' ? 0 : 1;
    return priorityGroup(a.priority) - priorityGroup(b.priority)
        || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
};

export const mergeKdsPriority = (
    priorities: Array<KdsTicket['priority'] | null | undefined>,
): KdsTicket['priority'] => priorities.includes('REMAKE')
    ? 'REMAKE'
    : priorities.includes('RUSH')
        ? 'RUSH'
        : 'NORMAL';

export const advanceKdsTicketIdsOnce = async (
    ticketIds: string[],
    advanceTicket: (ticketId: string) => Promise<void>,
) => {
    for (const ticketId of ticketIds) await advanceTicket(ticketId);
};

export const hasNewKdsTicket = (
    knownTicketIds: ReadonlySet<string>,
    tickets: Array<Pick<KdsTicket, 'id'>>,
) => tickets.some((ticket) => !knownTicketIds.has(ticket.id));

interface KdsStore {
    tickets: KdsTicket[];
    isLoading: boolean;
    error: string | null;
    fetchTickets: (params?: { station?: string; branchId?: string; includeServed?: boolean }) => Promise<void>;
    bumpTicket: (id: string) => Promise<void>;
    handoverOrder: (orderId: string) => Promise<void>;
    recallTicket: (id: string) => Promise<void>;
    toggleItemState: (ticketId: string, itemId: number) => Promise<void>;
}

export const useKdsStore = create<KdsStore>((set) => ({
    tickets: [],
    isLoading: false,
    error: null,
    fetchTickets: async (params) => {
        set({ isLoading: true, error: null });
        try {
            const res: any = await kdsApi.getTickets(params);
            const payload: any[] = Array.isArray(res)
                ? res
                : Array.isArray(res?.data)
                    ? res.data
                    : Array.isArray(res?.tickets)
                        ? res.tickets
                        : [];
            const tickets = payload.map((ticket: any) => ({
                ...ticket,
                items: Array.isArray(ticket?.items) ? ticket.items : [],
            }));
            set({ tickets, isLoading: false });
        } catch (e: any) {
            set({ error: e.message || 'Failed to fetch KDS tickets', isLoading: false });
        }
    },
    bumpTicket: async (id: string) => {
        try {
            const res: any = await kdsApi.bumpTicket(id);
            const served = res?.served || res?.data?.served;
            set((state) => ({
                tickets: served
                    ? state.tickets.filter(t => t.id !== id)
                    : state.tickets.map(t => t.id === id ? { ...t, status: 'READY', bumpedAt: new Date().toISOString() } : t)
            }));
        } catch (e: any) {
            set({ error: e?.code || e?.message || 'BUMP_TICKET_FAILED' });
        }
    },
    handoverOrder: async (orderId: string) => {
        try {
            await kdsApi.handoverOrder(orderId);
            set((state) => ({
                tickets: state.tickets.filter(t => t.orderId !== orderId)
            }));
        } catch (e: any) {
            set({ error: e?.code || e?.message || 'HANDOVER_ORDER_FAILED' });
            throw e;
        }
    },
    recallTicket: async (id: string) => {
        try {
            await kdsApi.recallTicket(id);
            set((state) => ({
                tickets: state.tickets.map(t => t.id === id ? { ...t, status: 'PREPARING', bumpedAt: null } : t)
            }));
        } catch (e: any) {
            set({ error: e?.code || e?.message || 'RECALL_TICKET_FAILED' });
        }
    },
    toggleItemState: async (ticketId: string, itemId: number) => {
        try {
            const res: any = await kdsApi.toggleItem(ticketId, itemId);
            const isBumped = res?.isBumped !== undefined ? res.isBumped : res.data?.isBumped;
            set((state) => ({
                tickets: state.tickets.map(t => {
                    if (t.id === ticketId) {
                        return {
                            ...t,
                            items: t.items.map(item => item.id === itemId ? { ...item, isBumped: isBumped !== undefined ? isBumped : !item.isBumped } : item)
                        };
                    }
                    return t;
                })
            }));
        } catch (e: any) {
            set({ error: e?.code || e?.message || 'TOGGLE_KDS_ITEM_FAILED' });
        }
    }
}));
