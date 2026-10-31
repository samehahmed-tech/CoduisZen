import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const routes = readFileSync(fileURLToPath(new URL('../routes.tsx', import.meta.url)), 'utf8');
const component = readFileSync(fileURLToPath(new URL('../components/PublicQrMenu.tsx', import.meta.url)), 'utf8');
const api = readFileSync(fileURLToPath(new URL('../services/api/publicQr.ts', import.meta.url)), 'utf8');

describe('public QR ordering UI contract', () => {
    it('exposes a public token-bound menu and idempotent order flow', () => {
        expect(routes).toContain("path: '/qr/:branchId/:tableId'");
        expect(routes).toContain('PublicQrMenu');
        expect(component).toContain('publicQrApi.getMenu');
        expect(component).toContain('publicQrApi.createOrder');
        expect(component).toContain('customerPhone');
        expect(component).toContain('toggleModifier');
        expect(component).toContain('modifiers');
        expect(api).toContain('X-RestoFlow-QR-Token');
        expect(api).toContain('Idempotency-Key');
    });
});
