import { describe, expect, it, vi } from 'vitest';
import {
    advanceKdsTicketIdsOnce,
    compareKdsTicketPriority,
    hasNewKdsTicket,
    mergeKdsPriority,
} from '../stores/useKdsStore';

describe('KDS ticket transition', () => {
    it('advances each kitchen ticket exactly once', async () => {
        const advanceTicket = vi.fn().mockResolvedValue(undefined);

        await advanceKdsTicketIdsOnce(['ticket-a', 'ticket-b'], advanceTicket);

        expect(advanceTicket.mock.calls).toEqual([['ticket-a'], ['ticket-b']]);
    });

    it('announces only an unseen ticket id', () => {
        const known = new Set(['ticket-a', 'ticket-b']);

        expect(hasNewKdsTicket(known, [{ id: 'ticket-a' }, { id: 'ticket-b' }])).toBe(false);
        expect(hasNewKdsTicket(known, [{ id: 'ticket-a' }, { id: 'ticket-c' }])).toBe(true);
    });

    it('puts rush and remake tickets before normal tickets, then keeps FIFO order', () => {
        const tickets = [
            { priority: 'NORMAL' as const, createdAt: '2026-07-27T08:00:00Z' },
            { priority: 'RUSH' as const, createdAt: '2026-07-27T08:02:00Z' },
            { priority: 'REMAKE' as const, createdAt: '2026-07-27T08:01:00Z' },
            { priority: 'NORMAL' as const, createdAt: '2026-07-27T07:59:00Z' },
        ];

        expect(tickets.sort(compareKdsTicketPriority).map(ticket => ticket.priority))
            .toEqual(['REMAKE', 'RUSH', 'NORMAL', 'NORMAL']);
        expect(mergeKdsPriority(['NORMAL', 'RUSH'])).toBe('RUSH');
        expect(mergeKdsPriority(['RUSH', 'REMAKE'])).toBe('REMAKE');
    });
});
