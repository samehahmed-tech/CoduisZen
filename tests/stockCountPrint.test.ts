import { describe, expect, it } from 'vitest';
import { buildStockCountPrintHtml } from '../services/stockCountPrint';

describe('stock count report printing', () => {
    it('renders quantities, variance value, notes and escapes user content', () => {
        const html = buildStockCountPrintHtml({
            id: 'CNT-1',
            countDate: '2026-07-30T00:00:00.000Z',
            type: 'DAILY',
            status: 'POSTED',
            warehouseName: 'Main <Store>',
            items: [{
                itemId: 'ITEM-1',
                itemName: 'Tomatoes',
                itemNameAr: 'طماطم',
                unit: 'kg',
                systemQty: 10,
                countedQty: 8,
                varianceQty: -2,
                cost: 5,
                notes: '<script>alert(1)</script>',
            }],
        }, {
            lang: 'ar',
            restaurantName: 'RestoFlow',
            currencySymbol: 'ج.م',
        });

        expect(html).toContain('CNT-1');
        expect(html).toContain('طماطم');
        expect(html).toContain('-10 ج.م');
        expect(html).toContain('Main &lt;Store&gt;');
        expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
        expect(html).not.toContain('<script>alert(1)</script>');
    });
});
