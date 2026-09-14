import { Request, Response } from 'express';
import { db } from '../db';
import { settings } from '../../src/db/schema';
import { eq } from 'drizzle-orm';
import { getStringParam } from '../utils/request';
import { upsertSetting } from '../utils/settingsStore';

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
                theme: 'fluent-frost'
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
        const { value, category, updated_by } = req.body;

        const updated = await upsertSetting({
            key,
            value,
            category: category || 'general',
            updatedBy: updated_by,
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
            upsertSetting({ key, value }),
        );

        await Promise.all(operations);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
