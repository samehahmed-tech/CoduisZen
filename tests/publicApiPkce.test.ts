import { describe, expect, it } from 'vitest';
import { isAllowedOAuthRedirectUri, isValidPkceChallenge, verifyPkceS256 } from '../server/utils/publicApiPkce';

describe('public API OAuth PKCE contract', () => {
    it('accepts HTTPS redirects and local development redirects only', () => {
        expect(isAllowedOAuthRedirectUri('https://app.example.com/oauth/callback')).toBe(true);
        expect(isAllowedOAuthRedirectUri('http://localhost:5173/callback')).toBe(true);
        expect(isAllowedOAuthRedirectUri('http://evil.example.com/callback')).toBe(false);
        expect(isAllowedOAuthRedirectUri('https://app.example.com/callback#fragment')).toBe(false);
    });

    it('requires S256 PKCE and verifies the code verifier', () => {
        const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXA';
        const challenge = 'bg-qE9_oRKWSMTs0NG0Z4wCHtL_7saC-y174jTvSl18';
        expect(isValidPkceChallenge(challenge, 'S256')).toBe(true);
        expect(isValidPkceChallenge(challenge, 'plain')).toBe(false);
        expect(verifyPkceS256(verifier, challenge)).toBe(true);
        expect(verifyPkceS256(`${verifier}x`, challenge)).toBe(false);
    });
});
