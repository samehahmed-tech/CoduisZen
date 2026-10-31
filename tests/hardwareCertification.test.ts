import { describe, expect, it } from 'vitest';
import {
    CASH_DRAWER_PULSE,
    getHardwareCertificationMatrix,
    getPrinterCertificationResult,
    isValidEan13,
    parseScaleReading,
} from '../src/services/hardwareCertification';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

describe('hardware certification harness', () => {
    it('keeps direct-offline printer support explicit', () => {
        expect(getPrinterCertificationResult('windows')).toEqual({ normalizedType: 'WINDOWS', directOffline: true });
        expect(getPrinterCertificationResult('lan')).toEqual({ normalizedType: 'LAN', directOffline: false });
    });

    it('uses the documented ESC/POS cash drawer pulse', () => {
        expect([...Buffer.from(CASH_DRAWER_PULSE, 'latin1')]).toEqual([0x1B, 0x70, 0x00, 0x19, 0xFA]);
    });

    it('validates EAN-13 check digits', () => {
        expect(isValidEan13('4006381333931')).toBe(true);
        expect(isValidEan13('4006381333932')).toBe(false);
        expect(isValidEan13('ABC')).toBe(false);
    });

    it('parses stable and unstable scale frames with conversions', () => {
        expect(parseScaleReading('ST,GS,+ 1.250 kg')).toEqual({ grams: 1250, stable: true, unit: 'kg' });
        expect(parseScaleReading('ST 1.250 kg')).toEqual({ grams: 1250, stable: true, unit: 'kg' });
        expect(parseScaleReading('US, 2.2 lb')).toEqual({ grams: 997.903, stable: false, unit: 'lb' });
        expect(parseScaleReading('12.5 g')).toEqual({ grams: 12.5, stable: false, unit: 'g' });
    });

    it('rejects malformed, negative and excessive readings', () => {
        expect(parseScaleReading('-1 kg')).toBeNull();
        expect(parseScaleReading('ST ??? kg')).toBeNull();
        expect(parseScaleReading('1000001 g')).toBeNull();
    });

    it('does not mark physical device certification as automated', () => {
        const matrix = getHardwareCertificationMatrix();
        expect(matrix.map((entry) => entry.capability)).toEqual([
            'receipt_printer', 'network_printer', 'cash_drawer', 'barcode_scanner', 'scale',
        ]);
        expect(matrix.find((entry) => entry.capability === 'network_printer')?.status).toBe('PHYSICAL_REQUIRED');
        expect(matrix.find((entry) => entry.capability === 'scale')?.status).toBe('PHYSICAL_REQUIRED');
    });

    it('keeps barcode inventory lookup free of cost and purchase-price fields', () => {
        const source = readFileSync(
            fileURLToPath(new URL('../server/controllers/barcodeLookupController.ts', import.meta.url)),
            'utf8',
        );
        const inventoryLookup = source.slice(
            source.indexOf('export const lookupInventoryItemByBarcode'),
            source.indexOf('export const unifiedBarcodeLookup'),
        );
        expect(inventoryLookup).not.toContain('SELECT TOP 1 * FROM inventory_items');
        expect(inventoryLookup).not.toContain('cost_price');
        expect(inventoryLookup).not.toContain('purchase_price');

        const menuLookup = source.slice(
            source.indexOf('export const lookupMenuItemByBarcode'),
            source.indexOf('export const lookupInventoryItemByBarcode'),
        );
        expect(menuLookup).not.toContain('mi.*');
        expect(menuLookup).not.toContain('mi.cost');
        expect(menuLookup).not.toContain('platform_pricing');
    });
});
