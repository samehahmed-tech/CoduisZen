import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('printer network privacy contract', () => {
    it('hides printer address and gateway identity from non-admin readers', () => {
        const source = fs.readFileSync('server/controllers/printerController.ts', 'utf8');
        expect(source).toContain("'CFG_MANAGE_PRINTERS'");
        expect(source).toContain('sanitizePrinterForViewer');
        expect(source).toContain('address: _address');
        expect(source).toContain('gatewayId: _gatewayId');
        expect(source).toContain('all.map(parsePrinterRoles).map');
    });
});
