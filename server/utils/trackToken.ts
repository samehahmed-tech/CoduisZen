import crypto from 'node:crypto';

/**
 * Signed public-tracking tokens (?t=). Order ids are time-based and partly
 * guessable, so the tracking link is an HMAC capability, not a secret id.
 */
const trackSigningSecret = () => String(process.env.JWT_SECRET || process.env.GATEWAY_TOKEN || '');

export const signTrackToken = (orderId: string): string | null => {
    const secret = trackSigningSecret();
    if (!secret) return null;
    return crypto.createHmac('sha256', secret).update(String(orderId)).digest('hex').slice(0, 32);
};

export const verifyTrackToken = (orderId: string, token: unknown): boolean => {
    const expected = signTrackToken(orderId);
    const given = String(token || '');
    if (!expected || !given) return false;
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(given, 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
};
