import { describe, expect, it } from 'vitest';
import { rankDriversForOrder } from '../services/driverAssignment';

const order = { lat: 30.05, lng: 31.25 };

describe('smart driver ranking', () => {
    it('returns empty when nobody is available', () => {
        expect(rankDriversForOrder([
            { id: 'a', name: 'A', status: 'BUSY' },
            { id: 'b', name: 'B', status: 'OFFLINE' },
        ], order)).toEqual([]);
    });

    it('prefers fewer active orders, then closer, then fresh telemetry', () => {
        const ranked = rankDriversForOrder([
            { id: 'far-busy', name: 'F', status: 'AVAILABLE', lat: 30.5, lng: 31.6, activeOrders: 3, lastSeenMinutes: 1 },
            { id: 'near-free', name: 'N', status: 'AVAILABLE', lat: 30.051, lng: 31.251, activeOrders: 0, lastSeenMinutes: 1 },
            { id: 'near-stale', name: 'S', status: 'AVAILABLE', lat: 30.051, lng: 31.251, activeOrders: 0, lastSeenMinutes: 30 },
        ], order);
        expect(ranked.map((r) => r.id)).toEqual(['near-free', 'near-stale', 'far-busy']);
    });

    it('works without any location (orders by load only)', () => {
        const ranked = rankDriversForOrder([
            { id: 'a', name: 'A', status: 'AVAILABLE', activeOrders: 2 },
            { id: 'b', name: 'B', status: 'AVAILABLE', activeOrders: 0 },
        ]);
        expect(ranked[0].id).toBe('b');
        expect(ranked[0].distanceKm).toBeNull();
    });
});
