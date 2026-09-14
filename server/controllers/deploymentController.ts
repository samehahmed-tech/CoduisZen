import { Request, Response } from 'express';
import crypto from 'node:crypto';
import { db } from '../db';
import { branches, settings } from '../../src/db/schema';
import { eq } from 'drizzle-orm';
import { upsertSetting, parseSettingJson } from '../utils/settingsStore';

const readSetting = async <T>(key: string, fallback: T): Promise<T> => {
    const [row] = await db.select().top(1).from(settings).where(eq(settings.key, key));
    return parseSettingJson<T>(row?.value, fallback);
};

const deploymentKey = (siteId: string) => `deployment.site.${siteId}`;
const secretKey = (siteId: string) => `deployment.secret.${siteId}`;
const commandKey = (siteId: string) => `deployment.commands.${siteId}`;
const updateReleaseKey = 'deployment.updateRelease';

export const getConfig = async (_req: Request, res: Response) => {
    const mode = await readSetting('deployment.mode', process.env.SITE_MODE || 'CENTRAL');
    const configuredSiteId = process.env.SITE_ID || `site-${crypto.createHash('sha256').update(process.cwd()).digest('hex').slice(0, 16)}`;
    const siteId = await readSetting('deployment.siteId', configuredSiteId);
    const branchId = await readSetting<string | null>('deployment.branchId', process.env.SITE_BRANCH_ID || null);
    const centralApiUrl = await readSetting('deployment.centralApiUrl', process.env.CENTRAL_API_URL || '');
    const [branch] = branchId ? await db.select().top(1).from(branches).where(eq(branches.id, branchId)) : [];
    const updateRelease = await readSetting<any>(updateReleaseKey, null);
    res.json({ mode, siteId, branchId, centralApiUrl, branch, serverIp: branch?.serverIp || null, updateRelease });
};

export const getUpdateRelease = async (_req: Request, res: Response) => {
    res.json(await readSetting<any>(updateReleaseKey, null));
};

export const updateRelease = async (req: Request, res: Response) => {
    const body = req.body || {};
    const version = String(body.version || '').trim();
    const setupUrl = String(body.setupUrl || body.url || '').trim();
    const sha256 = String(body.sha256 || '').trim().toLowerCase();
    const enabled = body.enabled !== false;
    if (!version || !setupUrl || !/^[a-f0-9]{64}$/.test(sha256)) {
        return res.status(400).json({ error: 'VERSION_SETUP_URL_AND_SHA256_REQUIRED' });
    }
    try {
        const parsed = new URL(setupUrl);
        if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('INVALID_SETUP_URL_PROTOCOL');
        if (parsed.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(parsed.hostname)) {
            return res.status(400).json({ error: 'SETUP_URL_MUST_USE_HTTPS' });
        }
    } catch (error: any) {
        return res.status(400).json({ error: error.message || 'INVALID_SETUP_URL' });
    }
    const release = {
        version,
        setupUrl,
        sha256,
        enabled,
        notes: String(body.notes || '').slice(0, 2000),
        publishedAt: new Date().toISOString(),
        publishedBy: req.user?.id || 'system',
    };
    await upsertSetting({ key: updateReleaseKey, value: release, category: 'deployment', updatedBy: req.user?.id || 'system' });
    res.json(release);
};

export const issuePairingToken = async (_req: Request, res: Response) => {
    const token = crypto.randomBytes(24).toString('base64url');
    await upsertSetting({ key: 'deployment.mode', value: 'CENTRAL', category: 'deployment' });
    await upsertSetting({ key: 'deployment.pairingToken', value: token, category: 'deployment' });
    res.json({ token, expiresIn: 'one-time until replaced' });
};

export const registerBranch = async (req: Request, res: Response) => {
    const body = req.body || {};
    const configuredToken = await readSetting('deployment.pairingToken', '');
    if (!configuredToken || String(body.pairingToken || '') !== String(configuredToken)) {
        return res.status(403).json({ error: 'INVALID_PAIRING_TOKEN' });
    }
    const siteId = String(body.siteId || '').trim();
    const name = String(body.name || '').trim();
    if (!siteId || !name) return res.status(400).json({ error: 'SITE_ID_AND_BRANCH_NAME_REQUIRED' });

    const mappedBranchId = await readSetting<string | null>(deploymentKey(siteId), null);
    let branchId = mappedBranchId || String(body.branchId || '').trim() || crypto.randomUUID();
    const values: any = {
        name,
        nameAr: body.nameAr || name,
        location: body.location || null,
        address: body.address || null,
        phone: body.phone || null,
        email: body.email || null,
        serverIp: body.serverIp || null,
        isActive: true,
        updatedAt: new Date(),
    };
    const [existing] = await db.select().top(1).from(branches).where(eq(branches.id, branchId));
    if (existing) await db.update(branches).set(values).where(eq(branches.id, branchId));
    else await db.insert(branches).values({ id: branchId, ...values, createdAt: new Date() });
    await upsertSetting({ key: deploymentKey(siteId), value: branchId, category: 'deployment' });
    const siteToken = await readSetting<string>(secretKey(siteId), '');
    const newSiteToken = siteToken || crypto.randomBytes(32).toString('base64url');
    if (!siteToken) await upsertSetting({ key: secretKey(siteId), value: newSiteToken, category: 'deployment' });
    await upsertSetting({ key: 'deployment.lastBranchRegistration', value: { siteId, branchId, at: new Date().toISOString() }, category: 'deployment' });
    // Pairing tokens are intentionally one-time. The central admin can issue a new one.
    await upsertSetting({ key: 'deployment.pairingToken', value: '', category: 'deployment' });
    const [registered] = await db.select().top(1).from(branches).where(eq(branches.id, branchId));
    res.status(existing ? 200 : 201).json({ success: true, branch: registered, siteId, branchId, siteToken: newSiteToken, mode: 'BRANCH' });
};

export const heartbeat = async (req: Request, res: Response) => {
    const siteId = String(req.body?.siteId || req.headers['x-site-id'] || '').trim();
    if (!siteId) return res.status(400).json({ error: 'SITE_ID_REQUIRED' });
    const branchId = await readSetting<string | null>(deploymentKey(siteId), null);
    if (!branchId) return res.status(404).json({ error: 'SITE_NOT_REGISTERED' });
    const expectedToken = await readSetting<string>(secretKey(siteId), '');
    if (!expectedToken || String(req.body?.siteToken || req.headers['x-site-token'] || '') !== expectedToken) return res.status(403).json({ error: 'INVALID_SITE_TOKEN' });
    const release = await readSetting<any>(updateReleaseKey, null);
    await upsertSetting({ key: `deployment.heartbeat.${siteId}`, value: { siteId, branchId, at: new Date().toISOString(), ip: req.ip, version: req.body?.version || null }, category: 'deployment' });
    res.json({ ok: true, siteId, branchId, at: new Date().toISOString(), update: release?.enabled !== false ? release : null });
};

export const getRegisteredSites = async (_req: Request, res: Response) => {
    const rows = await db.select().from(settings);
    const sites = rows.filter(row => row.key.startsWith('deployment.heartbeat.')).map(row => parseSettingJson<any>(row.value, null)).filter(Boolean);
    res.json(sites);
};

export const queueCommand = async (req: Request, res: Response) => {
    const body = req.body || {};
    const target = String(body.siteId || '').trim();
    const entity = String(body.entity || '').trim();
    const action = String(body.action || '').trim().toUpperCase();
    if (!target || !entity || !action) return res.status(400).json({ error: 'TARGET_ENTITY_ACTION_REQUIRED' });
    const rows = target === 'ALL_BRANCHES'
        ? (await db.select().from(settings)).filter(row => row.key.startsWith('deployment.site.'))
        : [];
    const targets = rows.length ? rows.map(row => row.key.replace('deployment.site.', '')) : [target];
    const commands = [];
    for (const siteId of targets) {
        const command = { id: crypto.randomUUID(), siteId, entity, action, payload: body.payload || {}, policy: body.policy || 'CENTRAL_MASTER', createdAt: new Date().toISOString() };
        const current = await readSetting<any[]>(commandKey(siteId), []);
        await upsertSetting({ key: commandKey(siteId), value: [...current, command].slice(-500), category: 'deployment' });
        commands.push(command);
    }
    res.status(201).json({ success: true, commands });
};

export const pullCommands = async (req: Request, res: Response) => {
    const siteId = String(req.body?.siteId || req.headers['x-site-id'] || '').trim();
    const siteToken = String(req.body?.siteToken || req.headers['x-site-token'] || '');
    const expectedToken = await readSetting<string>(secretKey(siteId), '');
    if (!siteId || !expectedToken || siteToken !== expectedToken) return res.status(403).json({ error: 'INVALID_SITE_CREDENTIALS' });
    res.json({ siteId, commands: await readSetting<any[]>(commandKey(siteId), []) });
};

export const acknowledgeCommand = async (req: Request, res: Response) => {
    const siteId = String(req.body?.siteId || req.headers['x-site-id'] || '').trim();
    const siteToken = String(req.body?.siteToken || req.headers['x-site-token'] || '');
    const commandId = String(req.body?.commandId || '').trim();
    const expectedToken = await readSetting<string>(secretKey(siteId), '');
    if (!siteId || !expectedToken || siteToken !== expectedToken) return res.status(403).json({ error: 'INVALID_SITE_CREDENTIALS' });
    const current = await readSetting<any[]>(commandKey(siteId), []);
    await upsertSetting({ key: commandKey(siteId), value: current.filter(command => command.id !== commandId), category: 'deployment' });
    res.json({ success: true });
};
