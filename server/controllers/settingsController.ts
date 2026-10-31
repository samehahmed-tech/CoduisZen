import { Request, Response } from 'express';
import { db } from '../db';
import { settings } from '../../src/db/schema';
import { eq } from 'drizzle-orm';
import { getStringParam } from '../utils/request';
import { upsertSetting } from '../utils/settingsStore';
import { createSignedAuditLog } from '../services/auditService';

const SENSITIVE_SETTINGS_KEYS = new Set([
    'geminiApiKey',
    'openRouterApiKey',
    'openrouterApiKey',
    'aiApiKey',
    'aiApiKeyEncrypted',
    'aiApiKeySource',
    'apiKey',
    'token',
    'secret',
]);

const isSensitiveSettingKey = (key: string) => {
    const normalized = String(key || '').trim();
    if (!normalized) return false;
    if (SENSITIVE_SETTINGS_KEYS.has(normalized)) return true;
    return /api.?key|secret|token/i.test(normalized);
};

/**
 * Get all settings as a flat object
 */
export const getAllSettings = async (req: Request, res: Response) => {
    try {
        const allSettings = await db.select().from(settings);
        const settingsMap: Record<string, any> = {};

        allSettings.forEach(s => {
            if (isSensitiveSettingKey(s.key)) return;
            settingsMap[s.key] = s.value;
        });

        // If empty, return default frontend-friendly structure
        if (Object.keys(settingsMap).length === 0) {
            return res.json({
                restaurantName: 'Coduis Zen',
                currency: 'EGP',
                taxRate: 14,
                serviceCharge: 0,
                language: 'ar',
                theme: 'aero'
            });
        }

        res.json(settingsMap);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Update a specific setting
 */
export const updateSetting = async (req: Request, res: Response) => {
    try {
        const key = getStringParam((req.params as any).key);
        if (!key) return res.status(400).json({ error: 'SETTING_KEY_REQUIRED' });
        if (isSensitiveSettingKey(key)) return res.status(403).json({ error: 'SENSITIVE_SETTING_BLOCKED' });
        const { value, category } = req.body;

        const updated = await upsertSetting({
            key,
            value,
            category: category || 'general',
            updatedBy: req.user?.id || null,
        });

        await createSignedAuditLog({
            eventType: 'SETTING_UPDATED',
            userId: req.user?.id || 'system',
            userRole: req.user?.role,
            branchId: req.effectiveBranchId || req.user?.branchId || null,
            requestId: req.requestId,
            sourceDevice: req.headers['user-agent'],
            payload: { key, category: category || 'general', valueType: typeof value },
            after: { updated: true },
            reason: 'Setting updated without recording its value',
        });

        res.json(updated);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Bulk update settings
 */
export const updateBulkSettings = async (req: Request, res: Response) => {
    try {
        const updates = req.body;

        const blocked = Object.keys(updates).filter((key) => isSensitiveSettingKey(key));
        if (blocked.length > 0) {
            return res.status(403).json({ error: 'SENSITIVE_SETTING_BLOCKED', keys: blocked });
        }

        const operations = Object.entries(updates).map(([key, value]) =>
            upsertSetting({ key, value, updatedBy: req.user?.id || null }),
        );

        await Promise.all(operations);
        await createSignedAuditLog({
            eventType: 'SETTINGS_BULK_UPDATED',
            userId: req.user?.id || 'system',
            userRole: req.user?.role,
            branchId: req.effectiveBranchId || req.user?.branchId || null,
            requestId: req.requestId,
            sourceDevice: req.headers['user-agent'],
            payload: { keys: Object.keys(updates).sort(), count: Object.keys(updates).length },
            after: { updated: true },
            reason: 'Settings bulk updated without recording values',
        });
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
