import { Request, Response } from 'express';
import { createSignedAuditLog } from '../services/auditService';
import {
    createManagedPublicApiKey,
    listPublicApiKeyMetadata,
    revokeManagedPublicApiKey,
    rotateManagedPublicApiKey,
    PUBLIC_API_SCOPES,
} from '../services/publicApiKeyStore';
import { isAllowedOAuthRedirectUri } from '../utils/publicApiPkce';

const errorResponse = (res: Response, error: any) => {
    const code = String(error?.message || error?.code || 'PUBLIC_API_KEY_OPERATION_FAILED');
    const status = Number(error?.statusCode) || (code.includes('CONFLICT') ? 409 : 500);
    return res.status(status).json({ code, message: status === 500 ? 'Public API key operation failed.' : code });
};

const audit = (req: Request, eventType: string, payload: Record<string, unknown>) => createSignedAuditLog({
    eventType,
    userId: req.user?.id || 'system',
    branchId: req.user?.branchId || null,
    payload,
    reason: 'PUBLIC_API_KEY_MANAGEMENT',
    sourceDevice: req.headers['user-agent'] || 'unknown',
    requestId: String(req.headers['x-request-id'] || `req-${Date.now()}`),
}).catch(() => undefined);

export const listKeys = async (_req: Request, res: Response) => {
    try {
        return res.json({ data: await listPublicApiKeyMetadata(), scopes: PUBLIC_API_SCOPES });
    } catch (error) {
        return errorResponse(res, error);
    }
};

export const createKey = async (req: Request, res: Response) => {
    try {
        const body = req.body || {};
        const expiresAt = body.expiresAt ? new Date(String(body.expiresAt)) : null;
        if (body.expiresAt && Number.isNaN(expiresAt?.getTime())) {
            return res.status(422).json({ code: 'PUBLIC_API_EXPIRY_INVALID', message: 'expiresAt must be an ISO date.' });
        }
        const redirectUris = body.redirectUris === undefined ? [] : body.redirectUris;
        if (!Array.isArray(redirectUris) || redirectUris.some((uri: unknown) => !isAllowedOAuthRedirectUri(uri))) {
            return res.status(422).json({ code: 'PUBLIC_API_REDIRECT_URIS_INVALID', message: 'redirectUris must contain HTTPS or localhost callback URLs.' });
        }
        const result = await createManagedPublicApiKey({
            name: typeof body.name === 'string' ? body.name : '',
            scopes: Array.isArray(body.scopes) ? body.scopes.map(String) : [],
            branchIds: Array.isArray(body.branchIds) ? body.branchIds.map(String) : [],
            redirectUris: redirectUris.map(String),
            expiresAt,
            createdBy: req.user?.id,
        });
        await audit(req, 'PUBLIC_API_KEY_CREATED', {
            keyId: result.metadata.id,
            keyPrefix: result.metadata.keyPrefix,
            scopes: result.metadata.scopes,
            branchIds: result.metadata.branchIds,
            redirectUris: result.metadata.redirectUris,
            expiresAt: result.metadata.expiresAt,
        });
        // `secret` is deliberately returned only in this response. It is not
        // persisted and is excluded from audit/log payloads.
        return res.status(201).json({ ...result.metadata, secret: result.secret });
    } catch (error) {
        return errorResponse(res, error);
    }
};

export const revokeKey = async (req: Request, res: Response) => {
    try {
        const id = String(req.params.id || '').trim();
        if (!id) return res.status(400).json({ code: 'PUBLIC_API_KEY_ID_REQUIRED', message: 'Key id is required.' });
        const revoked = await revokeManagedPublicApiKey(id);
        if (!revoked) return res.status(404).json({ code: 'PUBLIC_API_KEY_NOT_FOUND', message: 'API key was not found or is already revoked.' });
        await audit(req, 'PUBLIC_API_KEY_REVOKED', { keyId: revoked.id, keyPrefix: revoked.keyPrefix });
        return res.json(revoked);
    } catch (error) {
        return errorResponse(res, error);
    }
};

export const rotateKey = async (req: Request, res: Response) => {
    try {
        const id = String(req.params.id || '').trim();
        if (!id) return res.status(400).json({ code: 'PUBLIC_API_KEY_ID_REQUIRED', message: 'Key id is required.' });
        const body = req.body || {};
        const expiresAt = body.expiresAt ? new Date(String(body.expiresAt)) : undefined;
        if (body.expiresAt && Number.isNaN(expiresAt?.getTime())) {
            return res.status(422).json({ code: 'PUBLIC_API_EXPIRY_INVALID', message: 'expiresAt must be an ISO date.' });
        }
        const redirectUris = body.redirectUris === undefined ? undefined : body.redirectUris;
        if (redirectUris !== undefined && (!Array.isArray(redirectUris) || redirectUris.some((uri: unknown) => !isAllowedOAuthRedirectUri(uri)))) {
            return res.status(422).json({ code: 'PUBLIC_API_REDIRECT_URIS_INVALID', message: 'redirectUris must contain HTTPS or localhost callback URLs.' });
        }
        const result = await rotateManagedPublicApiKey(id, {
            ...(typeof body.name === 'string' ? { name: body.name } : {}),
            ...(Array.isArray(body.scopes) ? { scopes: body.scopes.map(String) } : {}),
            ...(Array.isArray(body.branchIds) ? { branchIds: body.branchIds.map(String) } : {}),
            ...(redirectUris !== undefined ? { redirectUris: redirectUris.map(String) } : {}),
            ...(body.expiresAt ? { expiresAt } : {}),
            createdBy: req.user?.id,
        });
        await audit(req, 'PUBLIC_API_KEY_ROTATED', {
            replacedKeyId: result.replacedKeyId,
            keyId: result.metadata.id,
            keyPrefix: result.metadata.keyPrefix,
            scopes: result.metadata.scopes,
            branchIds: result.metadata.branchIds,
            redirectUris: result.metadata.redirectUris,
            expiresAt: result.metadata.expiresAt,
        });
        return res.status(201).json({ ...result.metadata, secret: result.secret, replacedKeyId: result.replacedKeyId });
    } catch (error) {
        return errorResponse(res, error);
    }
};
