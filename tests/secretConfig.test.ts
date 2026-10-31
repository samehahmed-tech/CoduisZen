import { describe, expect, it } from 'vitest';
import { isStrongSecret, resolveConfiguredSecret } from '../server/utils/secretConfig';
import { signTrackToken } from '../server/utils/trackToken';

describe('secret configuration', () => {
    it('never provides an application hardcoded fallback', () => {
        expect(resolveConfiguredSecret('', undefined, null)).toBeNull();
        expect(resolveConfiguredSecret('primary', 'fallback')).toBe('primary');
        expect(resolveConfiguredSecret('', 'fallback')).toBe('fallback');
    });

    it('requires a sufficiently long secret', () => {
        expect(isStrongSecret('short')).toBe(false);
        expect(isStrongSecret('a'.repeat(32))).toBe(true);
    });

    it('does not sign tracking links from a gateway fallback secret', () => {
        const previousJwt = process.env.JWT_SECRET;
        const previousGateway = process.env.GATEWAY_TOKEN;
        const previousTrack = process.env.TRACK_TOKEN_SECRET;
        delete process.env.JWT_SECRET;
        delete process.env.TRACK_TOKEN_SECRET;
        process.env.GATEWAY_TOKEN = 'gateway-secret';
        try {
            expect(signTrackToken('order-1')).toBeNull();
        } finally {
            if (previousJwt === undefined) delete process.env.JWT_SECRET;
            else process.env.JWT_SECRET = previousJwt;
            if (previousGateway === undefined) delete process.env.GATEWAY_TOKEN;
            else process.env.GATEWAY_TOKEN = previousGateway;
            if (previousTrack === undefined) delete process.env.TRACK_TOKEN_SECRET;
            else process.env.TRACK_TOKEN_SECRET = previousTrack;
        }
    });

    it('uses the dedicated tracking secret instead of JWT_SECRET', () => {
        const previousJwt = process.env.JWT_SECRET;
        const previousTrack = process.env.TRACK_TOKEN_SECRET;
        process.env.JWT_SECRET = 'jwt-secret';
        process.env.TRACK_TOKEN_SECRET = 'track-secret';
        try {
            expect(signTrackToken('order-1')).toBeTruthy();
        } finally {
            if (previousJwt === undefined) delete process.env.JWT_SECRET;
            else process.env.JWT_SECRET = previousJwt;
            if (previousTrack === undefined) delete process.env.TRACK_TOKEN_SECRET;
            else process.env.TRACK_TOKEN_SECRET = previousTrack;
        }
    });
});
