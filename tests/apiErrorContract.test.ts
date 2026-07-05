import { describe, expect, it } from 'vitest';
import { normalizeErrorPayload } from '../server/middleware/errorContract';

describe('api error contract', () => {
    it('normalizes legacy { error } payload into standard contract', () => {
        const result = normalizeErrorPayload({ error: 'ORDER_VERSION_CONFLICT' }, 409, 'req-1');
        expect(result).toEqual({
            code: 'ORDER_VERSION_CONFLICT',
            message: 'ORDER_VERSION_CONFLICT',
            requestId: 'req-1',
        });
    });

    it('preserves explicit code/message and adds details', () => {
        const result = normalizeErrorPayload(
            { code: 'VALIDATION_ERROR', message: 'Invalid input', field: 'email' },
            400,
            'req-2',
        );
        expect(result.code).toBe('VALIDATION_ERROR');
        expect(result.message).toBe('Invalid input');
        expect(result.requestId).toBe('req-2');
        expect(result.details).toEqual({ field: 'email' });
    });

    it('derives fallback code from status when payload is empty', () => {
        const result = normalizeErrorPayload(undefined, 404, 'req-3');
        expect(result).toEqual({
            code: 'NOT_FOUND',
            message: 'NOT_FOUND',
            requestId: 'req-3',
        });
    });
});
