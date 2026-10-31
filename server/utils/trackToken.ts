import crypto from 'node:crypto';

/**
 * Signed public-tracking tokens (?t=). Order ids are time-based and partly
 * guessable, so the tracking link is an HMAC capability, not a secret id.
 */
// Public tracking is a separate capability and must not share the JWT trust
// domain or any bridge/gateway credential.
const trackSigningSecret = () => String(process.env.TRACK_TOKEN_SECRET || '');

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
