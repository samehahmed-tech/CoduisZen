export type TestDatabaseGuardInput = {
    nodeEnv?: string;
    testDatabaseUrl?: string;
    runtimeDatabaseUrl?: string;
    allowExplicit?: string;
};

export type TestDatabaseGuardResult =
    | { ok: true; databaseName: string }
    | { ok: false; reason: string };

const normalizeConnectionString = (value?: string) => String(value || '')
    .trim()
    .replace(/;+$/, '')
    .toLowerCase();

const extractDatabaseName = (connectionString: string): string => {
    const raw = connectionString.trim();
    if (raw.includes('://')) {
        try {
            return decodeURIComponent(new URL(raw).pathname.replace(/^\/+/, '')).trim();
        } catch {
            return '';
        }
    }

    for (const part of raw.split(';')) {
        const separator = part.indexOf('=');
        if (separator < 0) continue;
        const key = part.slice(0, separator).trim().toLowerCase();
        if (key !== 'database' && key !== 'initial catalog') continue;
        return part.slice(separator + 1).trim().replace(/^["']|["']$/g, '');
    }
    return '';
};

export const validateTestDatabaseTarget = (input: TestDatabaseGuardInput): TestDatabaseGuardResult => {
    if (input.nodeEnv !== 'test') return { ok: false, reason: 'NODE_ENV_MUST_BE_TEST' };

    const testUrl = String(input.testDatabaseUrl || '').trim();
    if (!testUrl) return { ok: false, reason: 'TEST_DATABASE_URL_REQUIRED' };

    if (input.runtimeDatabaseUrl
        && normalizeConnectionString(testUrl) === normalizeConnectionString(input.runtimeDatabaseUrl)) {
        return { ok: false, reason: 'MATCHES_RUNTIME_DATABASE_URL' };
    }

    const databaseName = extractDatabaseName(testUrl);
    if (!databaseName) return { ok: false, reason: 'DATABASE_NAME_REQUIRED' };
    if (databaseName.toLowerCase() === 'coduiszen') {
        return { ok: false, reason: 'OPERATIONAL_DATABASE_FORBIDDEN' };
    }

    const markedForTests = /(?:[-_](?:test|ci))$/i.test(databaseName);
    if (!markedForTests && input.allowExplicit !== '1') {
        return { ok: false, reason: 'TEST_DATABASE_NAME_NOT_MARKED' };
    }

    return { ok: true, databaseName };
};
