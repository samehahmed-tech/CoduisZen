import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (relative: string) => fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8');

describe('secret separation contract', () => {
    it('does not reuse JWT_SECRET for PIN lookup hashing', () => {
        expect(read('server/services/pinLookupService.ts')).toContain("requireEnv('PIN_LOOKUP_SECRET')");
        expect(read('server/services/pinLookupService.ts')).not.toContain('JWT_SECRET');
        expect(read('scripts/backfill-pin-lookup.ts')).not.toContain('process.env.JWT_SECRET');
    });

    it('requires and provisions the dedicated PIN lookup secret', () => {
        expect(read('scripts/validate-env.ts')).toContain("key: 'PIN_LOOKUP_SECRET', required: true");
        expect(read('scripts/dev-env-init.ts')).toContain("ensure('PIN_LOOKUP_SECRET'");
        expect(read('.env.production.example')).toContain('PIN_LOOKUP_SECRET=');
    });

    it('keeps public tracking on its own trust domain', () => {
        expect(read('server/utils/trackToken.ts')).toContain('process.env.TRACK_TOKEN_SECRET');
        expect(read('server/utils/trackToken.ts')).not.toContain('process.env.JWT_SECRET');
        expect(read('scripts/validate-env.ts')).toContain("key: 'TRACK_TOKEN_SECRET', required: true");
    });

    it('keeps payment checkout and table QR tokens on dedicated trust domains', () => {
        expect(read('server/utils/paymentSessionCrypto.ts')).not.toContain('process.env.JWT_SECRET');
        expect(read('server/utils/paymentSessionCrypto.ts')).toContain('process.env.PAYMENT_TOKEN_SECRET');
        expect(read('server/utils/publicQrToken.ts')).not.toContain('process.env.TRACK_TOKEN_SECRET');
        expect(read('server/utils/publicQrToken.ts')).toContain('process.env.PUBLIC_QR_SECRET');
        expect(read('scripts/validate-env.ts')).toContain("key: 'PAYMENT_TOKEN_SECRET', required: true");
        expect(read('scripts/validate-env.ts')).toContain("key: 'PUBLIC_QR_SECRET', required: true");
    });
});
