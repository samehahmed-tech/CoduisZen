import { describe, expect, it } from 'vitest';
import { validatePublicWebhookInput } from '../server/utils/publicWebhookPolicy';

describe('public webhook policy', () => {
    it('normalizes a branch-scoped subscription and clamps delivery settings', () => {
        expect(validatePublicWebhookInput({
            name: ' Partner ', url: 'https://partner.example/hooks', events: ['order.created', 'order.created'],
            branchId: 'branch-1', retryCount: 99, timeoutMs: 999,
        }, ['branch-1'])).toEqual({
            name: 'Partner', url: 'https://partner.example/hooks', events: ['order.created'],
            branchId: 'branch-1', retryCount: 5, timeoutMs: 1000,
        });
    });

    it('rejects unsupported events and branches outside the key allow-list', () => {
        expect(() => validatePublicWebhookInput({ name: 'x', url: 'https://x.example', events: ['orders.write'], branchId: 'branch-1' }, ['branch-1'])).toThrow('PUBLIC_WEBHOOK_EVENT_INVALID');
        expect(() => validatePublicWebhookInput({ name: 'x', url: 'https://x.example', events: ['order.created'], branchId: 'branch-2' }, ['branch-1'])).toThrow('PUBLIC_WEBHOOK_BRANCH_FORBIDDEN');
    });
});
