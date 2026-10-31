import crypto from 'node:crypto';
import { and, desc, eq, gt, inArray, isNull } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { branches, publicApiAuthorizationCodes, publicApiClients, publicApiRefreshTokens } from '../../src/db/schema';
import {
    hashPublicApiKey,
    parsePublicApiClients,
    PublicApiClient,
} from './publicApiKeyService';
import { PUBLIC_API_SCOPES, validatePublicApiKeyInput } from '../utils/publicApiKeyPolicy';
export { PUBLIC_API_SCOPES } from '../utils/publicApiKeyPolicy';

let schemaReady: Promise<void> | null = null;

const ensurePublicApiClientsTable = async () => {
    if (!schemaReady) {
        schemaReady = db.execute(sql`
            IF OBJECT_ID(N'dbo.public_api_clients', N'U') IS NULL
            BEGIN
                CREATE TABLE dbo.public_api_clients (
                    id NVARCHAR(64) NOT NULL CONSTRAINT pk_public_api_clients PRIMARY KEY,
                    name NVARCHAR(160) NOT NULL,
                    key_prefix NVARCHAR(32) NOT NULL,
                    key_hash NVARCHAR(64) NOT NULL CONSTRAINT uq_public_api_clients_key_hash UNIQUE,
                    scopes NVARCHAR(MAX) NOT NULL,
                    branch_ids NVARCHAR(MAX) NOT NULL,
                    redirect_uris NVARCHAR(MAX) NULL,
                    expires_at DATETIME2 NULL,
                    revoked_at DATETIME2 NULL,
                    last_used_at DATETIME2 NULL,
                    created_by NVARCHAR(255) NULL,
                    created_at DATETIME2 NOT NULL CONSTRAINT df_public_api_clients_created_at DEFAULT GETDATE(),
                    updated_at DATETIME2 NOT NULL CONSTRAINT df_public_api_clients_updated_at DEFAULT GETDATE()
                );
                CREATE INDEX idx_public_api_clients_active ON dbo.public_api_clients (revoked_at, expires_at);
            END
            IF COL_LENGTH(N'dbo.public_api_clients', N'redirect_uris') IS NULL
                ALTER TABLE dbo.public_api_clients ADD redirect_uris NVARCHAR(MAX) NULL;
            IF OBJECT_ID(N'dbo.public_api_refresh_tokens', N'U') IS NULL
            BEGIN
                CREATE TABLE dbo.public_api_refresh_tokens (
                    id NVARCHAR(64) NOT NULL CONSTRAINT pk_public_api_refresh_tokens PRIMARY KEY,
                    client_id NVARCHAR(64) NOT NULL,
                    token_hash NVARCHAR(64) NOT NULL CONSTRAINT uq_public_api_refresh_tokens_hash UNIQUE,
                    scopes NVARCHAR(MAX) NOT NULL,
                    branch_ids NVARCHAR(MAX) NOT NULL,
                    expires_at DATETIME2 NOT NULL,
                    consumed_at DATETIME2 NULL,
                    revoked_at DATETIME2 NULL,
                    created_at DATETIME2 NOT NULL CONSTRAINT df_public_api_refresh_tokens_created_at DEFAULT GETDATE()
                );
                CREATE INDEX idx_public_api_refresh_client ON dbo.public_api_refresh_tokens (client_id, revoked_at, consumed_at);
            END
            IF OBJECT_ID(N'dbo.public_api_authorization_codes', N'U') IS NULL
            BEGIN
                CREATE TABLE dbo.public_api_authorization_codes (
                    id NVARCHAR(64) NOT NULL CONSTRAINT pk_public_api_authorization_codes PRIMARY KEY,
                    code_hash NVARCHAR(64) NOT NULL CONSTRAINT uq_public_api_authorization_codes_hash UNIQUE,
                    client_id NVARCHAR(64) NOT NULL,
                    user_id NVARCHAR(255) NOT NULL,
                    redirect_uri NVARCHAR(2048) NOT NULL,
                    scopes NVARCHAR(MAX) NOT NULL,
                    branch_ids NVARCHAR(MAX) NOT NULL,
                    code_challenge NVARCHAR(128) NOT NULL,
                    expires_at DATETIME2 NOT NULL,
                    consumed_at DATETIME2 NULL,
                    created_at DATETIME2 NOT NULL CONSTRAINT df_public_api_authorization_codes_created_at DEFAULT GETDATE()
                );
                CREATE INDEX idx_public_api_auth_codes_client ON dbo.public_api_authorization_codes (client_id, expires_at, consumed_at);
            END
        `).then(() => undefined).catch((error) => {
            schemaReady = null;
            throw error;
        });
    }
    await schemaReady;
};

const parseStoredArray = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.map(String).map(v => v.trim()).filter(Boolean);
    if (typeof value !== 'string' || !value.trim()) return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.map(String).map(v => v.trim()).filter(Boolean) : [];
    } catch {
        return [];
    }
};

const mapStoredClient = (row: any): PublicApiClient => ({
    id: String(row.id),
    keyHash: String(row.keyHash || '').toLowerCase(),
    scopes: parseStoredArray(row.scopes),
    branchIds: parseStoredArray(row.branchIds),
    redirectUris: parseStoredArray(row.redirectUris),
    ...(row.expiresAt ? { expiresAt: new Date(row.expiresAt).toISOString() } : {}),
});

export const getManagedPublicApiClients = async (): Promise<PublicApiClient[]> => {
    const stored = await listManagedPublicApiClients();
    return stored
        .filter(row => !row.revokedAt && (!row.expiresAt || new Date(row.expiresAt).getTime() > Date.now()))
        .map(mapStoredClient);
};

export const findManagedPublicApiClient = async (secret: string) => {
    const { findPublicApiClient } = await import('./publicApiKeyService');
    return findPublicApiClient(secret, await getManagedPublicApiClients());
};

export const findManagedPublicApiClientById = async (id: string) => {
    const rows = await getManagedPublicApiClients();
    return rows.find(client => client.id === String(id || '').trim());
};

export const createPublicApiRefreshTokenRecord = async (input: {
    id: string;
    clientId: string;
    tokenHash: string;
    scopes: string[];
    branchIds: string[];
    expiresAt: Date;
}) => {
    await ensurePublicApiClientsTable();
    await db.insert(publicApiRefreshTokens).values(input);
};

export const consumePublicApiRefreshToken = async (tokenHash: string) => {
    await ensurePublicApiClientsTable();
    const [row] = await db.update(publicApiRefreshTokens)
        .set({ consumedAt: new Date() })
        .where(and(
            eq(publicApiRefreshTokens.tokenHash, tokenHash),
            isNull(publicApiRefreshTokens.consumedAt),
            isNull(publicApiRefreshTokens.revokedAt),
        ))
        .returning();
    if (!row || !row.expiresAt || new Date(row.expiresAt).getTime() <= Date.now()) return null;
    return row;
};

const hashAuthorizationCode = (value: string) => crypto.createHash('sha256').update(value, 'utf8').digest('hex');

export const createPublicApiAuthorizationCode = async (input: {
    clientId: string;
    userId: string;
    redirectUri: string;
    scopes: string[];
    branchIds: string[];
    codeChallenge: string;
    expiresAt: Date;
}) => {
    await ensurePublicApiClientsTable();
    const code = `rf_code_${crypto.randomBytes(32).toString('base64url')}`;
    const id = crypto.randomUUID();
    await db.insert(publicApiAuthorizationCodes).values({
        id,
        codeHash: hashAuthorizationCode(code),
        clientId: input.clientId,
        userId: input.userId,
        redirectUri: input.redirectUri,
        scopes: input.scopes,
        branchIds: input.branchIds,
        codeChallenge: input.codeChallenge,
        expiresAt: input.expiresAt,
    });
    return code;
};

export const consumePublicApiAuthorizationCode = async (code: string, expected: {
    clientId: string;
    redirectUri: string;
    codeChallenge: string;
}) => {
    await ensurePublicApiClientsTable();
    const [row] = await db.update(publicApiAuthorizationCodes)
        .set({ consumedAt: new Date() })
        .where(and(
            eq(publicApiAuthorizationCodes.codeHash, hashAuthorizationCode(code)),
            eq(publicApiAuthorizationCodes.clientId, expected.clientId),
            eq(publicApiAuthorizationCodes.redirectUri, expected.redirectUri),
            eq(publicApiAuthorizationCodes.codeChallenge, expected.codeChallenge),
            isNull(publicApiAuthorizationCodes.consumedAt),
            gt(publicApiAuthorizationCodes.expiresAt, new Date()),
        ))
        .returning();
    return row || null;
};

export const listManagedPublicApiClients = async () => {
    await ensurePublicApiClientsTable();
    const rows = await db.select().from(publicApiClients).orderBy(desc(publicApiClients.createdAt));
    return rows;
};

export const getAllPublicApiClients = async (): Promise<PublicApiClient[]> => {
    const configured = parsePublicApiClients();
    try {
        return configured.concat(await getManagedPublicApiClients());
    } catch {
        // Environment-backed keys remain available during a schema rollout or
        // a temporary database outage; managed keys fail closed in that case.
        return configured;
    }
};

const toRecord = (row: any) => ({
    id: String(row.id),
    name: String(row.name),
    keyPrefix: String(row.keyPrefix),
    scopes: parseStoredArray(row.scopes),
    branchIds: parseStoredArray(row.branchIds),
    redirectUris: parseStoredArray(row.redirectUris),
    expiresAt: row.expiresAt ? new Date(row.expiresAt).toISOString() : null,
    revokedAt: row.revokedAt ? new Date(row.revokedAt).toISOString() : null,
    lastUsedAt: row.lastUsedAt ? new Date(row.lastUsedAt).toISOString() : null,
    createdBy: row.createdBy || null,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
});

export const listPublicApiKeyMetadata = async () => {
    const rows = await listManagedPublicApiClients();
    return rows.map(toRecord);
};

export const createManagedPublicApiKey = async (input: {
    name: string;
    scopes: string[];
    branchIds: string[];
    redirectUris?: string[];
    expiresAt?: Date | null;
    createdBy?: string;
}) => {
    const validated = validatePublicApiKeyInput(input);
    await ensurePublicApiClientsTable();
    if (!validated.branchIds.includes('*')) {
        const existingBranches = await db.select({ id: branches.id }).from(branches).where(inArray(branches.id, validated.branchIds));
        const existingIds = new Set(existingBranches.map(branch => branch.id));
        if (validated.branchIds.some(branchId => !existingIds.has(branchId))) {
            throw Object.assign(new Error('PUBLIC_API_BRANCH_INVALID'), { statusCode: 422 });
        }
    }
    const secret = `rf_live_${crypto.randomBytes(32).toString('base64url')}`;
    const id = crypto.randomUUID();
    const keyPrefix = secret.slice(0, 16);
    const [row] = await db.insert(publicApiClients).values({
        id,
        name: validated.name,
        keyPrefix,
        keyHash: hashPublicApiKey(secret),
        scopes: validated.scopes,
        branchIds: validated.branchIds,
        redirectUris: validated.redirectUris || [],
        expiresAt: input.expiresAt || null,
        createdBy: input.createdBy || null,
    }).returning();
    return { metadata: toRecord(row), secret };
};

export const rotateManagedPublicApiKey = async (id: string, input: {
    name?: string;
    scopes?: string[];
    branchIds?: string[];
    redirectUris?: string[];
    expiresAt?: Date | null;
    createdBy?: string;
}) => {
    await ensurePublicApiClientsTable();
    const [current] = await db.select().from(publicApiClients)
        .where(and(eq(publicApiClients.id, id.trim()), isNull(publicApiClients.revokedAt)))
        .limit(1);
    if (!current || (current.expiresAt && new Date(current.expiresAt).getTime() <= Date.now())) {
        throw Object.assign(new Error('PUBLIC_API_KEY_NOT_FOUND'), { statusCode: 404 });
    }

    const validated = validatePublicApiKeyInput({
        name: input.name ?? String(current.name),
        scopes: input.scopes ?? parseStoredArray(current.scopes),
        branchIds: input.branchIds ?? parseStoredArray(current.branchIds),
        redirectUris: input.redirectUris ?? parseStoredArray(current.redirectUris),
    });
    if (!validated.branchIds.includes('*')) {
        const existingBranches = await db.select({ id: branches.id }).from(branches).where(inArray(branches.id, validated.branchIds));
        const existingIds = new Set(existingBranches.map(branch => branch.id));
        if (validated.branchIds.some(branchId => !existingIds.has(branchId))) {
            throw Object.assign(new Error('PUBLIC_API_BRANCH_INVALID'), { statusCode: 422 });
        }
    }

    const secret = `rf_live_${crypto.randomBytes(32).toString('base64url')}`;
    const replacementId = crypto.randomUUID();
    const keyPrefix = secret.slice(0, 16);
    const expiresAt = input.expiresAt === undefined ? current.expiresAt : input.expiresAt;
    const result = await db.transaction(async (tx) => {
        await tx.update(publicApiClients)
            .set({ revokedAt: new Date(), updatedAt: new Date() })
            .where(and(eq(publicApiClients.id, current.id), isNull(publicApiClients.revokedAt)));
        const [replacement] = await tx.insert(publicApiClients).values({
            id: replacementId,
            name: validated.name,
            keyPrefix,
            keyHash: hashPublicApiKey(secret),
            scopes: validated.scopes,
            branchIds: validated.branchIds,
            redirectUris: validated.redirectUris || [],
            expiresAt: expiresAt || null,
            createdBy: input.createdBy || null,
        }).returning();
        return replacement;
    });
    return { metadata: toRecord(result), secret, replacedKeyId: current.id };
};

export const revokeManagedPublicApiKey = async (id: string) => {
    await ensurePublicApiClientsTable();
    const [row] = await db.update(publicApiClients)
        .set({ revokedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(publicApiClients.id, id.trim()), isNull(publicApiClients.revokedAt)))
        .returning();
    return row ? toRecord(row) : null;
};

export const markManagedPublicApiKeyUsed = (id: string) => {
    void db.update(publicApiClients)
        .set({ lastUsedAt: new Date(), updatedAt: new Date() })
        .where(eq(publicApiClients.id, id))
        .catch(() => undefined);
};
