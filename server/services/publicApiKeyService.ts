import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { NextFunction, Request, Response } from 'express';
import { requireEnv } from '../config/env';

export interface PublicApiClient {
    id: string;
    keyHash: string;
    scopes: string[];
    branchIds: string[];
    redirectUris?: string[];
    expiresAt?: string;
}

declare module 'express-serve-static-core' {
    interface Request {
        publicApiClient?: PublicApiClient;
    }
}

const API_KEY_HEADER = 'x-restoflow-api-key';
const HASH_LENGTH = 64;

export const hashPublicApiKey = (value: string) =>
    crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');

export const parsePublicApiClients = (raw = process.env.PUBLIC_API_KEYS_JSON || ''): PublicApiClient[] => {
    if (!raw.trim()) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.flatMap((entry: any) => {
            const id = String(entry?.id || '').trim();
            const keyHash = String(entry?.keyHash || entry?.hash || '').trim().toLowerCase();
            const scopes = Array.isArray(entry?.scopes) ? entry.scopes.map((scope: unknown) => String(scope).trim()).filter(Boolean) : [];
            const branchIds = Array.isArray(entry?.branchIds || entry?.branches)
                ? (entry.branchIds || entry.branches).map((branch: unknown) => String(branch).trim()).filter(Boolean)
                : [];
            const expiresAt = entry?.expiresAt ? new Date(String(entry.expiresAt)) : undefined;
            const expiresAtIso = expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt.toISOString() : undefined;
            if (entry?.expiresAt && !expiresAtIso) return [];
            if (entry?.revoked === true || (expiresAtIso && expiresAt!.getTime() <= Date.now())) return [];
            if (!id || !/^[a-f0-9]{64}$/.test(keyHash) || scopes.length === 0 || branchIds.length === 0) return [];
            return [{ id, keyHash, scopes, branchIds, ...(expiresAtIso ? { expiresAt: expiresAtIso } : {}) }];
        });
    } catch {
        return [];
    }
};

const constantTimeEqual = (left: string, right: string) => {
    const a = Buffer.from(left, 'utf8');
    const b = Buffer.from(right, 'utf8');
    return a.length === b.length && a.length === HASH_LENGTH && crypto.timingSafeEqual(a, b);
};

export const findPublicApiClient = (apiKey: string, clients = parsePublicApiClients()) => {
    const suppliedHash = hashPublicApiKey(apiKey);
    return clients.find(client => constantTimeEqual(client.keyHash, suppliedHash));
};

export const authenticatePublicApiKeyWithClients = (req: Request, res: Response, next: NextFunction, clients: PublicApiClient[]) => {
    if (clients.length === 0) {
        return res.status(503).json({ code: 'PUBLIC_API_DISABLED', message: 'Public API keys are not configured.' });
    }
    const supplied = String(req.header(API_KEY_HEADER) || '').trim();
    const bearer = String(req.header('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    let client = supplied ? findPublicApiClient(supplied, clients) : undefined;
    if (!client && bearer) {
        try {
            const payload = jwt.verify(bearer, requireEnv('JWT_SECRET')) as {
                sub?: string;
                typ?: string;
                iss?: string;
                scopes?: unknown;
                branchIds?: unknown;
            };
            const tokenScopes = Array.isArray(payload.scopes) ? payload.scopes.map(String) : [];
            const tokenBranches = Array.isArray(payload.branchIds) ? payload.branchIds.map(String) : [];
            const stored = clients.find(candidate => candidate.id === payload.sub);
            if (payload.typ === 'restoflow-public-api' && payload.iss === 'restoflow-public-api' && stored
                && tokenScopes.every(scope => stored.scopes.includes(scope))
                && tokenBranches.every(branch => stored.branchIds.includes(branch))) {
                client = { ...stored, scopes: tokenScopes, branchIds: tokenBranches };
            }
        } catch {
            client = undefined;
        }
    }
    if (!client) return res.status(401).json({ code: 'PUBLIC_API_KEY_INVALID', message: 'A valid X-RestoFlow-API-Key is required.' });
    req.publicApiClient = client;
    return next();
};

/** Backward-compatible env-only middleware for isolated consumers/tests. */
export const authenticatePublicApiKey = (req: Request, res: Response, next: NextFunction) =>
    authenticatePublicApiKeyWithClients(req, res, next, parsePublicApiClients());

/** Production middleware combines managed DB keys with legacy env keys. */
export const authenticateManagedPublicApiKey = async (req: Request, res: Response, next: NextFunction) => {
    const { getAllPublicApiClients, markManagedPublicApiKeyUsed } = await import('./publicApiKeyStore');
    const clients = await getAllPublicApiClients();
    const result = authenticatePublicApiKeyWithClients(req, res, next, clients);
    if (req.publicApiClient?.id && !parsePublicApiClients().some(client => client.id === req.publicApiClient?.id)) {
        markManagedPublicApiKeyUsed(req.publicApiClient.id);
    }
    return result;
};

export const requirePublicApiScope = (scope: string) => (req: Request, res: Response, next: NextFunction) => {
    if (!req.publicApiClient?.scopes.includes(scope)) {
        return res.status(403).json({ code: 'PUBLIC_API_SCOPE_FORBIDDEN', message: `Scope ${scope} is required.` });
    }
    return next();
};

export const requirePublicApiBranch = (req: Request, res: Response, next: NextFunction) => {
    const branchId = String(req.params.branchId || req.query.branchId || '').trim();
    const allowed = req.publicApiClient?.branchIds || [];
    if (!branchId) return res.status(400).json({ code: 'PUBLIC_API_BRANCH_REQUIRED', message: 'branchId is required.' });
    if (!allowed.includes('*') && !allowed.includes(branchId)) {
        return res.status(403).json({ code: 'PUBLIC_API_BRANCH_FORBIDDEN', message: 'The API key is not allowed to access this branch.' });
    }
    req.effectiveBranchId = branchId;
    return next();
};

export const PUBLIC_API_KEY_HEADER = API_KEY_HEADER;
