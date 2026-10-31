import { describe, expect, it } from 'vitest';
import { parsePublicQuoteLines, resolvePublicItemModifiers, resolvePublicItemSize } from '../server/utils/publicOrderQuotePolicy';

describe('public order quote input policy', () => {
    it('normalizes valid line input', () => {
        expect(parsePublicQuoteLines([{ menu_item_id: 'item-1', quantity: 2 }])).toEqual({ ok: true, lines: [{ menuItemId: 'item-1', quantity: 2, sizeId: '', hasModifiers: false, modifiers: [] }] });
    });
    it('rejects invalid quantities', () => {
        expect(parsePublicQuoteLines([{ menuItemId: 'item-1', quantity: 0 }])).toEqual({ ok: false, code: 'PUBLIC_API_QUOTE_LINE_INVALID' });
    });
    it('preserves modifier ids for authoritative server-side pricing', () => {
        expect(parsePublicQuoteLines([{ menuItemId: 'item-1', quantity: 1, modifiers: [{ id: 'extra', price: 999 }] }])).toEqual({ ok: true, lines: [{ menuItemId: 'item-1', quantity: 1, sizeId: '', hasModifiers: true, modifiers: [{ id: 'extra' }] }] });
    });

    it('prices only linked options and enforces group limits', () => {
        const item = { modifierGroups: [{ id: 'extras', minSelection: 1, maxSelection: 1, options: [{ id: 'cheese', name: 'Cheese', price: 25 }] }] };
        expect(resolvePublicItemModifiers(item, [{ id: 'cheese' }])).toMatchObject({ ok: true, total: 25, modifiers: [{ id: 'cheese', price: 25 }] });
        expect(resolvePublicItemModifiers(item, [])).toEqual({ ok: false, code: 'PUBLIC_API_MODIFIER_REQUIRED' });
        expect(resolvePublicItemModifiers(item, [{ id: 'unknown' }])).toEqual({ ok: false, code: 'PUBLIC_API_MODIFIER_OPTION_INVALID' });
    });

    it('resolves only a configured item size and ignores client price', () => {
        const item = { price: 100, sizes: [{ id: 'large', name: 'Large', price: 140 }] };
        expect(resolvePublicItemSize(item, 'large')).toMatchObject({ ok: true, price: 140, size: { id: 'large' } });
        expect(resolvePublicItemSize(item, 'missing')).toEqual({ ok: false, code: 'PUBLIC_API_ITEM_SIZE_INVALID' });
    });
});
