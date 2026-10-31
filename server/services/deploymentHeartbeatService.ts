import { db } from '../db';
import { settings } from '../../src/db/schema';
import { eq } from 'drizzle-orm';
import { parseSettingJson } from '../utils/settingsStore';
import fs from 'node:fs';
import path from 'node:path';
import {
    buildIntegrationIdempotencyKey,
    classifyIntegrationHttpStatus,
    computeIntegrationBackoffMs,
    shouldRetryIntegrationFailure,
} from '../utils/integrationRuntimePolicy';

const readSetting = async <T>(key: string, fallback: T): Promise<T> => {
    const [row] = await db.select().top(1).from(settings).where(eq(settings.key, key));
    return parseSettingJson<T>(row?.value, fallback);
};

const versionParts = (value: string) => String(value || '').replace(/^v/i, '').split('.').map(part => Number.parseInt(part, 10) || 0);
const isNewer = (candidate: string, current: string) => {
    const a = versionParts(candidate); const b = versionParts(current);
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
    return false;
};

const HEARTBEAT_TIMEOUT_MS = 10000;
const HEARTBEAT_MAX_ATTEMPTS = 2;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const postHeartbeat = async (url: string, siteId: string, siteToken: string, currentVersion: string) => {
    const idempotencyKey = buildIntegrationIdempotencyKey('DEPLOYMENT', siteId, 'HEARTBEAT', { siteId, version: currentVersion });
    let lastError: any;
    for (let attempt = 1; attempt <= HEARTBEAT_MAX_ATTEMPTS; attempt += 1) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), HEARTBEAT_TIMEOUT_MS);
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-site-id': siteId,
                    'x-site-token': siteToken,
                    'x-idempotency-key': idempotencyKey,
                },
                // The token stays in the authenticated header only; do not
                // duplicate it in a body that could be logged downstream.
                body: JSON.stringify({ siteId, version: currentVersion }),
                signal: controller.signal,
            });
            if (response.ok) return response;
            const error: any = new Error(`HEARTBEAT_HTTP_${response.status}`);
            error.status = response.status;
            error.failureClass = classifyIntegrationHttpStatus(response.status);
            throw error;
        } catch (error: any) {
            lastError = error;
            const failureClass = error?.failureClass || classifyIntegrationHttpStatus(error?.status);
            if (attempt >= HEARTBEAT_MAX_ATTEMPTS || !shouldRetryIntegrationFailure(failureClass)) throw error;
            await sleep(computeIntegrationBackoffMs(attempt, 250, 2000));
        } finally {
            clearTimeout(timer);
        }
    }
    throw lastError || new Error('HEARTBEAT_FAILED');
};

export const deploymentHeartbeatService = {
    timer: undefined as ReturnType<typeof setInterval> | undefined,
    async beat() {
        const mode = await readSetting('deployment.mode', process.env.SITE_MODE || 'CENTRAL');
        if (mode !== 'BRANCH') return;
        const central = await readSetting('deployment.centralApiUrl', process.env.CENTRAL_API_URL || '');
        const siteId = await readSetting('deployment.siteId', process.env.SITE_ID || '');
        const siteToken = await readSetting('deployment.siteToken', process.env.SITE_TOKEN || '');
        if (!central || !siteId || !siteToken) return;
        let currentVersion = '0.0.0';
        try {
            const state = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'install-state.json'), 'utf8'));
            currentVersion = String(state.version || currentVersion);
        } catch { /* first run */ }
        const response = await postHeartbeat(`${String(central).replace(/\/$/, '')}/api/deployment/heartbeat`, siteId, siteToken, currentVersion);
        const payload: any = await response.json();
        const release = payload?.update;
        if (release?.version && release?.setupUrl && release?.sha256 && isNewer(release.version, currentVersion)) {
            fs.writeFileSync(path.join(process.cwd(), 'runtime', 'pending-update.json'), JSON.stringify({ ...release, currentVersion, receivedAt: new Date().toISOString() }, null, 2));
        }
    },
    start(intervalMs = 30000) {
        if (this.timer) return;
        this.timer = setInterval(() => this.beat().catch(() => undefined), intervalMs);
        this.beat().catch(() => undefined);
    },
};
