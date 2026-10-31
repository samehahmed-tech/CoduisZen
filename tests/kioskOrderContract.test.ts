import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('self-ordering kiosk contract', () => {
    it('submits through the canonical order store with branch scope and unpaid state', () => {
        const source = readFileSync(resolve(process.cwd(), 'components/kiosk/SelfOrderingKiosk.tsx'), 'utf8');
        expect(source).toContain('const result = await placeOrder({');
        expect(source).toContain('type: OrderType.KIOSK');
        expect(source).toContain('source: \'kiosk\'');
        expect(source).toContain('branchId: settings.activeBranchId');
        expect(source).toContain('isPaid: false');
        expect(source).toContain('status: OrderStatus.PENDING');
    });
});
