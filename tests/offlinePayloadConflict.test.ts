import { describe, expect, it } from 'vitest';
import { isOfflinePayloadConflict } from '../src/services/syncQueueUtils';

describe('offline payload conflict policy', () => {
    it('quarantines a same-id order create with a different payload', () => {
        expect(isOfflinePayloadConflict('order', 'CREATE', { id: 'o1', total: 10 }, { total: 11, id: 'o1' })).toBe(true);
        expect(isOfflinePayloadConflict('order', 'CREATE', { id: 'o1', total: 10 }, { id: 'o1', total: 10 })).toBe(false);
    });

    it('does not block normal update-style queue replacement', () => {
        expect(isOfflinePayloadConflict('orderStatus', 'UPDATE', { id: 'o1', status: 'READY' }, { id: 'o1', status: 'SERVED' })).toBe(false);
    });
});
