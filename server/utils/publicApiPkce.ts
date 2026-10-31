import crypto from 'node:crypto';

export const normalizeRedirectUri = (value: unknown) => String(value || '').trim();

export const isAllowedOAuthRedirectUri = (value: unknown) => {
    const raw = normalizeRedirectUri(value);
    if (!raw || raw.length > 2048 || raw.includes('#')) return false;
    try {
        const url = new URL(raw);
        const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
        if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalhost)) return false;
        return Boolean(url.hostname) && !url.username && !url.password;
    } catch {
        return false;
    }
};

export const isValidPkceChallenge = (challenge: unknown, method: unknown) => {
    const value = String(challenge || '').trim();
    return String(method || '').trim().toUpperCase() === 'S256'
        && /^[A-Za-z0-9_-]{43,128}$/.test(value);
};

export const verifyPkceS256 = (verifier: unknown, challenge: unknown) => {
    const value = String(verifier || '').trim();
    const expected = String(challenge || '').trim();
    if (!/^[A-Za-z0-9._~-]{43,128}$/.test(value) || !/^[A-Za-z0-9_-]{43,128}$/.test(expected)) return false;
    const actual = pkceS256Challenge(value);
    const left = Buffer.from(actual, 'utf8');
    const right = Buffer.from(expected, 'utf8');
    return left.length === right.length && crypto.timingSafeEqual(left, right);
};

export const pkceS256Challenge = (verifier: string) =>
    crypto.createHash('sha256').update(verifier, 'utf8').digest('base64url');
