type AttemptTracker = {
    attempts: number[];
    blockedUntil?: number;
};

const LOGIN_WINDOW_MS = Number(process.env.AUTH_LOGIN_WINDOW_MS || 15 * 60 * 1000);
const LOGIN_BLOCK_MS = Number(process.env.AUTH_LOGIN_BLOCK_MS || 15 * 60 * 1000);
const MAX_IP_ATTEMPTS = Number(process.env.AUTH_LOGIN_MAX_IP_ATTEMPTS || 40);
const MAX_EMAIL_ATTEMPTS = Number(process.env.AUTH_LOGIN_MAX_EMAIL_ATTEMPTS || 8);

const ipTrackers = new Map<string, AttemptTracker>();
const emailTrackers = new Map<string, AttemptTracker>();

const now = () => Date.now();

const normalizeEmail = (email: string) => String(email || '').trim().toLowerCase();

const getTracker = (map: Map<string, AttemptTracker>, key: string): AttemptTracker => {
    const existing = map.get(key);
    if (existing) return existing;
    const created: AttemptTracker = { attempts: [] };
    map.set(key, created);
    return created;
};

const prune = (tracker: AttemptTracker, currentTime: number) => {
    tracker.attempts = tracker.attempts.filter((ts) => currentTime - ts <= LOGIN_WINDOW_MS);
    if (tracker.blockedUntil && tracker.blockedUntil <= currentTime) {
        tracker.blockedUntil = undefined;
    }
};

const recordAttempt = (tracker: AttemptTracker, currentTime: number, maxAttempts: number) => {
    tracker.attempts.push(currentTime);
    prune(tracker, currentTime);
    if (tracker.attempts.length >= maxAttempts) {
        tracker.blockedUntil = currentTime + LOGIN_BLOCK_MS;
    }
};

export const getLoginThrottleState = (ip: string, email: string) => {
    const currentTime = now();
    const normalizedEmail = normalizeEmail(email);
    const ipTracker = getTracker(ipTrackers, ip || 'unknown');
    const emailTracker = getTracker(emailTrackers, normalizedEmail || 'unknown');
    prune(ipTracker, currentTime);
    prune(emailTracker, currentTime);

    const blockedUntil = Math.max(ipTracker.blockedUntil || 0, emailTracker.blockedUntil || 0);
    const blocked = blockedUntil > currentTime;
    const retryAfterSeconds = blocked ? Math.max(1, Math.ceil((blockedUntil - currentTime) / 1000)) : 0;

    return { blocked, retryAfterSeconds };
};

export const registerLoginFailure = (ip: string, email: string) => {
    const currentTime = now();
    const normalizedEmail = normalizeEmail(email);
    const ipTracker = getTracker(ipTrackers, ip || 'unknown');
    const emailTracker = getTracker(emailTrackers, normalizedEmail || 'unknown');

    recordAttempt(ipTracker, currentTime, Math.max(1, MAX_IP_ATTEMPTS));
    recordAttempt(emailTracker, currentTime, Math.max(1, MAX_EMAIL_ATTEMPTS));
};

export const registerLoginSuccess = (ip: string, email: string) => {
    const normalizedEmail = normalizeEmail(email);
    if (ipTrackers.has(ip)) ipTrackers.delete(ip);
    if (emailTrackers.has(normalizedEmail)) emailTrackers.delete(normalizedEmail);
};
