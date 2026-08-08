import { describe, expect, it } from 'vitest';
import {
    isKitchenRoutingPrinter,
    normalizeKdsStationName,
    resolvePrinterRoutingStation,
} from '../server/services/kdsRouting';

describe('KDS printer routing', () => {
    it('uses station id first, then a kitchen role, with normalized names', () => {
        expect(resolvePrinterRoutingStation({
            stationId: 'Hot Line',
            code: 'PRN-01',
            role: 'GRILL',
        })).toBe('HOT_LINE');
        expect(resolvePrinterRoutingStation({ role: 'COLD_STATION' })).toBe('COLD_STATION');
        expect(normalizeKdsStationName('  dessert pass  ')).toBe('DESSERT_PASS');
    });

    it('does not expose cashier-only printers as kitchen stations', () => {
        expect(isKitchenRoutingPrinter({ role: 'CASHIER', code: 'POS-01' })).toBe(false);
        expect(isKitchenRoutingPrinter({ roles: ['CASHIER', 'BAR'] })).toBe(true);
    });
});
