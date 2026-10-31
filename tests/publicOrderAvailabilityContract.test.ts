import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('public order availability contract', () => {
    it('rejects inactive/closed branches and unavailable menu items before order creation', () => {
        const source = readFileSync(resolve(process.cwd(), 'server/controllers/publicApiController.ts'), 'utf8');
        const createStart = source.indexOf('export const createPublicApiOrder');
        const createEnd = source.indexOf('export const createPublicApiCheckout', createStart);
        const create = source.slice(createStart, createEnd);
        expect(create).toContain("code: 'PUBLIC_API_BRANCH_INACTIVE'");
        expect(create).toContain("code: 'PUBLIC_API_BRANCH_CLOSED'");
        expect(create).toContain('isMenuItemAvailableNow(item');
        expect(create).toContain("code: 'PUBLIC_API_ORDER_ITEMS_UNAVAILABLE'");
        expect(create).toContain('await createOrder(internalRequest, internalResponse)');
    });

    it('applies the same branch and item availability policy to quotes', () => {
        const source = readFileSync(resolve(process.cwd(), 'server/controllers/publicApiController.ts'), 'utf8');
        const quoteStart = source.indexOf('export const quotePublicApiOrder');
        const quoteEnd = source.indexOf('const publicOrderError', quoteStart);
        const quote = source.slice(quoteStart, quoteEnd);
        expect(quote).toContain("code: 'PUBLIC_API_BRANCH_CLOSED'");
        expect(quote).toContain('isMenuItemAvailableNow(item');
        expect(quote).toContain("code: 'PUBLIC_API_QUOTE_ITEMS_UNAVAILABLE'");
    });
});
