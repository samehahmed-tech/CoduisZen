import { afterEach, describe, expect, it } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';

const OLD_ENV = { ...process.env };

afterEach(() => {
    process.env = { ...OLD_ENV };
});

describe('mapkit token service', () => {
    it('signs a verifiable ES256 token with team iss + key kid', async () => {
        const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
        const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
        process.env.MAPKIT_TEAM_ID = 'RC5PQQLBTM';
        process.env.MAPKIT_KEY_ID = 'PFW3Z5262A';
        process.env.MAPKIT_PRIVATE_KEY = pem;

        const { getMapkitToken, isMapkitConfigured, resetMapkitCache } = await import('../server/services/mapkitService');
        resetMapkitCache();
        expect(isMapkitConfigured()).toBe(true);

        const { token, expiresAt } = getMapkitToken();
        const [h, p, s] = token.split('.');
        expect(h && p && s).toBeTruthy();
        const header = JSON.parse(Buffer.from(h, 'base64url').toString());
        expect(header.alg).toBe('ES256');
        expect(header.kid).toBe('PFW3Z5262A');

        // Verify signature with the public key (node:crypto, no network).
        const { createVerify } = await import('node:crypto');
        const verifier = createVerify('sha256');
        verifier.update(`${h}.${p}`);
        const sig = Buffer.from(s, 'base64url');
        const der = joseToDer(sig);
        expect(verifier.verify(publicKey, der)).toBe(true);

        const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
        expect(payload.iss).toBe('RC5PQQLBTM');
        expect(payload.exp - payload.iat).toBe(6 * 24 * 3600);
        expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());

        // Second call hits the cache (same token).
        expect(getMapkitToken().token).toBe(token);
    });

    it('refuses without configuration', async () => {
        delete process.env.MAPKIT_TEAM_ID;
        delete process.env.MAPKIT_KEY_ID;
        delete process.env.MAPKIT_PRIVATE_KEY;
        const { getMapkitToken, isMapkitConfigured, resetMapkitCache } = await import('../server/services/mapkitService');
        resetMapkitCache();
        expect(isMapkitConfigured()).toBe(false);
        expect(() => getMapkitToken()).toThrow('MAPKIT_NOT_CONFIGURED');
    });
});

// JOSE R||S -> DER for node verify.
const joseToDer = (sig: Buffer) => {
    const half = sig.length / 2;
    const r = sig.subarray(0, half);
    const s = sig.subarray(half);
    const trim = (b: Buffer) => {
        let i = 0;
        while (i < b.length - 1 && b[i] === 0) i += 1;
        return b.subarray(i);
    };
    const rT = trim(Buffer.from(r));
    const sT = trim(Buffer.from(s));
    const rP = rT[0] & 0x80 ? Buffer.concat([Buffer.from([0]), rT]) : rT;
    const sP = sT[0] & 0x80 ? Buffer.concat([Buffer.from([0]), sT]) : sT;
    return Buffer.concat([
        Buffer.from([0x30, 2 + rP.length + 2 + sP.length, 0x02, rP.length]),
        rP,
        Buffer.from([0x02, sP.length]),
        sP,
    ]);
};
