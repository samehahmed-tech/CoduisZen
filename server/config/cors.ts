const DEFAULT_ORIGINS = [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
];

const isPrivateIpHost = (hostname: string) => {
    if (hostname.startsWith('10.')) return true;
    if (hostname.startsWith('192.168.')) return true;
    const match = hostname.match(/^172\.(\d{1,2})\./);
    if (!match) return false;
    const secondOctet = Number(match[1]);
    return secondOctet >= 16 && secondOctet <= 31;
};

const parseOriginsFromEnv = () => {
    const value = process.env.CORS_ORIGINS;
    if (!value) return [];
    return value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
};

export const getAllowedOrigins = () => {
    const fromEnv = parseOriginsFromEnv();
    return [...new Set([...DEFAULT_ORIGINS, ...fromEnv])];
};

export const isOriginAllowed = (origin?: string) => {
    if (!origin) return true;

    const allowed = getAllowedOrigins();
    if (allowed.includes(origin)) return true;

    if (process.env.ALLOW_LAN_ORIGINS !== 'false') {
        try {
            const parsed = new URL(origin);
            if (isPrivateIpHost(parsed.hostname) || parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
                return true;
            }
        } catch {
            return false;
        }
    }

    // In non-production, allow local network origins for device testing.
    if (process.env.NODE_ENV !== 'production') {
        try {
            const parsed = new URL(origin);
            if (isPrivateIpHost(parsed.hostname)) return true;
        } catch {
            return false;
        }
    }

    return false;
};
