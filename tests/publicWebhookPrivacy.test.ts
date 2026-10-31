import { describe, expect, it } from 'vitest';
import { sanitizePublicWebhookPayload } from '../server/utils/publicWebhookPrivacy';

describe('public webhook privacy', () => {
    it('removes customer, payment, and transport secrets recursively while keeping operational fields', () => {
        expect(sanitizePublicWebhookPayload({
            id: 'order-1',
            branchId: 'branch-1',
            status: 'COMPLETED',
            total: 120,
            customer: { name: 'Private Name', phone: '01000000000' },
            payment: { cardNumber: '4111111111111111' },
            meta: { accessToken: 'do-not-share', station: 'KITCHEN' },
        })).toEqual({
            id: 'order-1',
            branchId: 'branch-1',
            status: 'COMPLETED',
            total: 120,
            meta: { station: 'KITCHEN' },
        });
    });
});
