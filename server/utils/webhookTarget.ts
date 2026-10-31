import dns from 'node:dns/promises';
import net from 'node:net';

const PRIVATE_HOSTNAMES = new Set([
    'localhost',
    'localhost.localdomain',
    'metadata.google.internal',
]);

const isPrivateIpv4 = (value: string) => {
    const parts = value.split('.').map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
    const [a, b] = parts;
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254)
        || (a === 172 && b >= 16 && b <= 31)
        || (a === 192 && b === 168);
};

const isPrivateIp = (value: string) => {
    const normalized = value.toLowerCase().replace(/^\[|\]$/g, '');
    if (net.isIP(normalized) === 4) return isPrivateIpv4(normalized);
    if (net.isIP(normalized) === 6) {
        return normalized === '::1'
            || normalized === '::'
            || normalized.startsWith('fe80:')
            || normalized.startsWith('fc')
            || normalized.startsWith('fd')
            || normalized.startsWith('::ffff:127.')
            || normalized.startsWith('::ffff:10.')
            || normalized.startsWith('::ffff:192.168.');
    }
    return false;
};

const isPrivateHostname = (hostname: string) => {
    const normalized = hostname.toLowerCase().replace(/\.$/, '');
    return PRIVATE_HOSTNAMES.has(normalized)
        || normalized.endsWith('.localhost')
        || normalized.endsWith('.local')
        || normalized.endsWith('.internal');
};

export const validateWebhookTargetUrl = (rawUrl: string): URL => {
    let url: URL;
    try {
        url = new URL(String(rawUrl || '').trim());
    } catch {
        throw new Error('WEBHOOK_URL_INVALID');
    }

    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('WEBHOOK_URL_PROTOCOL_NOT_ALLOWED');
    if (url.username || url.password) throw new Error('WEBHOOK_URL_CREDENTIALS_NOT_ALLOWED');

    if (process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS !== 'true'
        && (isPrivateHostname(url.hostname) || isPrivateIp(url.hostname))) {
        throw new Error('WEBHOOK_PRIVATE_TARGET_BLOCKED');
    }
    return url;
};

/** Re-check DNS at delivery time to reduce DNS-rebinding SSRF risk. */
export const assertSafeWebhookTarget = async (rawUrl: string): Promise<URL> => {
    const url = validateWebhookTargetUrl(rawUrl);
    if (process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS === 'true' || net.isIP(url.hostname)) return url;

    const addresses = await dns.lookup(url.hostname, { all: true });
    if (addresses.some(({ address }) => isPrivateIp(address))) {
        throw new Error('WEBHOOK_PRIVATE_TARGET_BLOCKED');
    }
    return url;
};
