import { Request, Response } from 'express';
import {
    createPublicApiAuthorizationCode,
    findManagedPublicApiClientById,
} from '../services/publicApiKeyStore';
import { resolveOAuthScopes } from '../utils/publicApiOAuthPolicy';
import {
    isAllowedOAuthRedirectUri,
    isValidPkceChallenge,
    normalizeRedirectUri,
} from '../utils/publicApiPkce';

const MAX_STATE_LENGTH = 512;
const AUTHORIZATION_CODE_TTL_MS = 5 * 60 * 1000;

const delegatedBranches = (req: Request, clientBranches: string[]) => {
    const user = req.user;
    if (!user) return [];
    const userBranches = new Set([user.branchId, ...(user.allowedBranches || [])].filter(Boolean).map(String));
    if (String(user.role || '').toUpperCase() === 'SUPER_ADMIN') return clientBranches;
    if (clientBranches.includes('*')) return Array.from(userBranches);
    return clientBranches.filter(branchId => userBranches.has(branchId));
};

export const authorizePublicApi = async (req: Request, res: Response) => {
    const query = req.query || {};
    const clientId = String(query.client_id || '').trim();
    const redirectUri = normalizeRedirectUri(query.redirect_uri);
    const responseType = String(query.response_type || '').trim();
    const state = String(query.state || '').trim();
    const codeChallenge = String(query.code_challenge || '').trim();
    const codeChallengeMethod = String(query.code_challenge_method || '').trim();

    if (responseType !== 'code') return res.status(400).json({ error: 'unsupported_response_type' });
    if (!clientId || !redirectUri || !state || state.length > MAX_STATE_LENGTH) {
        return res.status(400).json({ error: 'invalid_request', error_description: 'client_id, redirect_uri and bounded state are required.' });
    }
    if (!isAllowedOAuthRedirectUri(redirectUri) || !isValidPkceChallenge(codeChallenge, codeChallengeMethod)) {
        return res.status(400).json({ error: 'invalid_request', error_description: 'A valid HTTPS redirect and S256 PKCE challenge are required.' });
    }

    try {
        const client = await findManagedPublicApiClientById(clientId);
        if (!client || !(client.redirectUris || []).includes(redirectUri)) {
            return res.status(400).json({ error: 'invalid_request', error_description: 'The redirect URI is not registered for this client.' });
        }

        const scopes = resolveOAuthScopes(query.scope, client.scopes);
        const branchIds = delegatedBranches(req, client.branchIds);
        if (branchIds.length === 0) return res.status(403).json({ error: 'access_denied', error_description: 'No client branch is assigned to the authenticated user.' });

        if (String(query.consent || '').toLowerCase() !== 'approve') {
            return res.json({
                consent_required: true,
                client_id: client.id,
                scope: scopes.join(' '),
                branch_ids: branchIds,
                redirect_uri: redirectUri,
                state,
            });
        }

        const code = await createPublicApiAuthorizationCode({
            clientId: client.id,
            userId: req.user!.id,
            redirectUri,
            scopes,
            branchIds,
            codeChallenge,
            expiresAt: new Date(Date.now() + AUTHORIZATION_CODE_TTL_MS),
        });
        const destination = new URL(redirectUri);
        destination.searchParams.set('code', code);
        destination.searchParams.set('state', state);
        return res.redirect(302, destination.toString());
    } catch (error: any) {
        if (error?.message === 'OAUTH_SCOPE_FORBIDDEN') {
            return res.status(400).json({ error: 'invalid_scope', error_description: 'Requested scope is not granted to this client.' });
        }
        return res.status(503).json({ error: 'temporarily_unavailable', error_description: 'OAuth authorization is temporarily unavailable.' });
    }
};
