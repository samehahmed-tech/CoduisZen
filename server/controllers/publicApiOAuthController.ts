import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Request, Response } from 'express';
import { requireEnv } from '../config/env';
import {
    consumePublicApiAuthorizationCode,
    consumePublicApiRefreshToken,
    createPublicApiRefreshTokenRecord,
    findManagedPublicApiClient,
    findManagedPublicApiClientById,
} from '../services/publicApiKeyStore';
import { resolveOAuthScopes } from '../utils/publicApiOAuthPolicy';
import { pkceS256Challenge } from '../utils/publicApiPkce';

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const hashRefreshTokenId = (value: string) => crypto.createHash('sha256').update(value, 'utf8').digest('hex');

export const issueTokenPair = async (
    client: { id: string; scopes: string[]; branchIds: string[] },
    scopes: string[],
    branchIds = client.branchIds,
) => {
    const secret = requireEnv('JWT_SECRET');
    const accessToken = jwt.sign({
        sub: client.id,
        typ: 'restoflow-public-api',
        scopes,
        branchIds,
        iss: 'restoflow-public-api',
    }, secret, { expiresIn: ACCESS_TOKEN_TTL_SECONDS });

    const refreshId = crypto.randomUUID();
    const refreshToken = jwt.sign({
        sub: client.id,
        typ: 'restoflow-public-api-refresh',
        scopes,
        branchIds,
        iss: 'restoflow-public-api',
        jti: refreshId,
    }, secret, { expiresIn: REFRESH_TOKEN_TTL_SECONDS });
    await createPublicApiRefreshTokenRecord({
        id: refreshId,
        clientId: client.id,
        tokenHash: hashRefreshTokenId(refreshId),
        scopes,
        branchIds,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    });
    return { accessToken, refreshToken };
};

export const issuePublicApiAccessToken = async (req: Request, res: Response) => {
    const body = req.body || {};
    const grantType = String(body.grant_type || '').trim();
    let clientId = String(body.client_id || '').trim();
    let clientSecret = String(body.client_secret || '').trim();
    const authorization = String(req.header('authorization') || '');
    if ((!clientId || !clientSecret) && /^Basic\s+/i.test(authorization)) {
        try {
            const decoded = Buffer.from(authorization.replace(/^Basic\s+/i, '').trim(), 'base64').toString('utf8');
            const separator = decoded.indexOf(':');
            if (separator > 0) {
                clientId = decoded.slice(0, separator);
                clientSecret = decoded.slice(separator + 1);
            }
        } catch {
            clientId = '';
            clientSecret = '';
        }
    }

    if (grantType === 'refresh_token') {
        const suppliedRefreshToken = String(body.refresh_token || '').trim();
        if (!suppliedRefreshToken) return res.status(400).json({ error: 'invalid_request', error_description: 'refresh_token is required.' });
        try {
            const payload = jwt.verify(suppliedRefreshToken, requireEnv('JWT_SECRET')) as {
                sub?: string;
                typ?: string;
                iss?: string;
                jti?: string;
                scopes?: unknown;
                branchIds?: unknown;
            };
            if (payload.typ !== 'restoflow-public-api-refresh' || payload.iss !== 'restoflow-public-api' || !payload.sub || !payload.jti) {
                return res.status(400).json({ error: 'invalid_grant', error_description: 'Refresh token is invalid.' });
            }
            const client = await findManagedPublicApiClientById(payload.sub);
            const tokenRecord = await consumePublicApiRefreshToken(hashRefreshTokenId(payload.jti));
            if (!client || !tokenRecord || tokenRecord.clientId !== client.id) {
                return res.status(400).json({ error: 'invalid_grant', error_description: 'Refresh token is invalid or already used.' });
            }
            const tokenScopes = Array.isArray(payload.scopes) ? payload.scopes.map(String) : [];
            const tokenBranches = Array.isArray(payload.branchIds) ? payload.branchIds.map(String) : [];
            const scopes = resolveOAuthScopes(tokenScopes, client.scopes);
            const branchIds = tokenBranches.length > 0
                && (tokenBranches.includes('*') || tokenBranches.every(branch => client.branchIds.includes('*') || client.branchIds.includes(branch)))
                ? tokenBranches
                : client.branchIds;
            const pair = await issueTokenPair(client, scopes, branchIds);
            return res.json({
                access_token: pair.accessToken,
                refresh_token: pair.refreshToken,
                token_type: 'Bearer',
                expires_in: ACCESS_TOKEN_TTL_SECONDS,
                scope: scopes.join(' '),
            });
        } catch {
            return res.status(400).json({ error: 'invalid_grant', error_description: 'Refresh token is invalid or expired.' });
        }
    }

    if (grantType === 'authorization_code') {
        const authorizationCode = String(body.code || '').trim();
        const redirectUri = String(body.redirect_uri || '').trim();
        const codeVerifier = String(body.code_verifier || '').trim();
        if (!clientId || !authorizationCode || !redirectUri || !codeVerifier) {
            return res.status(400).json({ error: 'invalid_request', error_description: 'client_id, code, redirect_uri and code_verifier are required.' });
        }
        try {
            const codeRecord = await consumePublicApiAuthorizationCode(authorizationCode, {
                clientId,
                redirectUri,
                codeChallenge: pkceS256Challenge(codeVerifier),
            });
            const client = await findManagedPublicApiClientById(clientId);
            if (!client || !codeRecord || codeRecord.clientId !== client.id) {
                return res.status(400).json({ error: 'invalid_grant', error_description: 'Authorization code is invalid, expired, or already used.' });
            }
            const recordScopes = Array.isArray(codeRecord.scopes) ? codeRecord.scopes.map(String) : [];
            const scopes = resolveOAuthScopes(recordScopes, client.scopes);
            const tokenBranches = Array.isArray(codeRecord.branchIds) ? codeRecord.branchIds.map(String) : [];
            const branchIds = tokenBranches.length > 0
                && (tokenBranches.includes('*') || tokenBranches.every(branch => client.branchIds.includes('*') || client.branchIds.includes(branch)))
                ? tokenBranches
                : client.branchIds;
            const pair = await issueTokenPair(client, scopes, branchIds);
            return res.json({
                access_token: pair.accessToken,
                refresh_token: pair.refreshToken,
                token_type: 'Bearer',
                expires_in: ACCESS_TOKEN_TTL_SECONDS,
                scope: scopes.join(' '),
            });
        } catch (error: any) {
            if (error?.message === 'OAUTH_SCOPE_FORBIDDEN') {
                return res.status(400).json({ error: 'invalid_scope', error_description: 'Authorization code scope is no longer granted to this client.' });
            }
            return res.status(400).json({ error: 'invalid_grant', error_description: 'Authorization code is invalid, expired, or already used.' });
        }
    }

    if (grantType !== 'client_credentials') {
        return res.status(400).json({ error: 'unsupported_grant_type', error_description: 'Supported grants are authorization_code, client_credentials and refresh_token.' });
    }
    if (!clientId || !clientSecret) {
        res.setHeader('WWW-Authenticate', 'Basic realm="RestoFlow Public API"');
        return res.status(401).json({ error: 'invalid_client', error_description: 'client_id and client_secret are required.' });
    }

    try {
        const client = await findManagedPublicApiClient(clientSecret);
        if (!client || client.id !== clientId) {
            res.setHeader('WWW-Authenticate', 'Basic realm="RestoFlow Public API"');
            return res.status(401).json({ error: 'invalid_client', error_description: 'Client credentials are invalid.' });
        }

        const scopes = resolveOAuthScopes(body.scope, client.scopes);
        const pair = await issueTokenPair(client, scopes);

        return res.json({
            access_token: pair.accessToken,
            refresh_token: pair.refreshToken,
            token_type: 'Bearer',
            expires_in: ACCESS_TOKEN_TTL_SECONDS,
            scope: scopes.join(' '),
        });
    } catch (error: any) {
        if (error?.message === 'OAUTH_SCOPE_FORBIDDEN') {
            return res.status(400).json({ error: 'invalid_scope', error_description: 'Requested scope is not granted to this client.' });
        }
        return res.status(503).json({ error: 'temporarily_unavailable', error_description: 'OAuth service is temporarily unavailable.' });
    }
};
