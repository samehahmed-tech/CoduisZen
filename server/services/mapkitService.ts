/**
 * Apple MapKit JS token service — server-side only.
 *
 * MapKit JS needs a short-lived ES256 JWT (header kid = Key ID, iss = Team ID)
 * signed with the .p8 private key. The key NEVER leaves the server: clients
 * fetch a token from GET /api/maps/apple-token.
 *
 * Env (never commit real values):
 *   MAPKIT_TEAM_ID=RC5PQQLBTM
 *   MAPKIT_KEY_ID=PFW3Z5262A
 *   MAPKIT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
 */

import { createPrivateKey, sign } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const TOKEN_TTL_MS = 6 * 24 * 3600 * 1000; // 6 days: dynamic (self-signed) tokens are NOT bound to the
// portal domain list, so localhost / LAN IPs / Vercel preview URLs all work with
// zero portal edits. The short TTL keeps us ahead of any Apple-side cap on
// unrestricted token lifetime (portal "None" tokens expire after ~7 days).
const REFRESH_SKEW_MS = 24 * 3600 * 1000; // refresh 1 day before expiry

type CachedToken = { token: string; expiresAtMs: number };
let cache: CachedToken | null = null;
let shippedEnv: Record<string, string> | null = null;

/**
 * Zero-step installs: the hotfix/setup builders stage a `server.env.add file
 * (MAPKIT_* only) next to the installed server. When the process env lacks
 * the keys, read them from that shipped file instead of failing.
 */
const readShippedEnv = (): Record<string, string> => {
    if (shippedEnv) return shippedEnv;
    shippedEnv = {};
    try {
        const candidates = [join(process.cwd(), 'server.env.add')];
        for (const path of candidates) {
            if (!existsSync(path)) continue;
            const text = readFileSync(path, 'utf8');
            for (const raw of text.split(/\r?\n/)) {
                const line = raw.trim();
                if (!line || line.startsWith('#')) continue;
                const eq = line.indexOf('=');
                if (eq < 0) continue;
                const key = line.slice(0, eq).trim();
                let value = line.slice(eq + 1).trim();
                if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.slice(1, -1);
                }
                if (key.startsWith('MAPKIT_') && value) shippedEnv[key] = value;
            }
            if (Object.keys(shippedEnv).length > 0) break;
        }
    } catch { /* fall through to env-only */ }
    return shippedEnv;
};

const readEnv = () => {
    const fallback = readShippedEnv();
    const pick = (key: string) => (process.env[key] || fallback[key] || '').trim();
    return {
        teamId: pick('MAPKIT_TEAM_ID'),
        keyId: pick('MAPKIT_KEY_ID'),
        // Allow both real newlines and escaped \n (single-line env values).
        privateKey: pick('MAPKIT_PRIVATE_KEY').replace(/\\n/g, '\n').trim(),
    };
};

export const isMapkitConfigured = () => {
    const env = readEnv();
    return Boolean(env.teamId && env.keyId && env.privateKey.includes('BEGIN PRIVATE KEY'));
};

const base64url = (input: Buffer | string) =>
    Buffer.from(input as any).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const signEs256 = (header: Record<string, string>, payload: Record<string, number | string>, pem: string) => {
    const encoded = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
    const key = createPrivateKey(pem);
    const der = sign('sha256', Buffer.from(encoded), { key, dsaEncoding: 'ieee-p1363' } as any);
    return `${encoded}.${base64url(der)}`;
};

export const getMapkitToken = (): { token: string; expiresAt: string } => {
    const env = readEnv();
    if (!env.teamId || !env.keyId || !env.privateKey.includes('BEGIN PRIVATE KEY')) {
        throw new Error('MAPKIT_NOT_CONFIGURED');
    }
    if (cache && Date.now() < cache.expiresAtMs - REFRESH_SKEW_MS) {
        return { token: cache.token, expiresAt: new Date(cache.expiresAtMs).toISOString() };
    }
    const issuedAtSec = Math.floor(Date.now() / 1000);
    const expiresAtMs = Date.now() + TOKEN_TTL_MS;
    const token = signEs256(
        { alg: 'ES256', kid: env.keyId, typ: 'JWT' },
        { iss: env.teamId, iat: issuedAtSec, exp: Math.floor(expiresAtMs / 1000) },
        env.privateKey,
    );
    cache = { token, expiresAtMs };
    return { token, expiresAt: new Date(expiresAtMs).toISOString() };
};

/** Test hook — clears the in-memory token cache. */
export const resetMapkitCache = () => {
    cache = null;
};
