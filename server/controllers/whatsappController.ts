import { Request, Response } from 'express';
import { db } from '../db';
import { settings } from '../../src/db/schema';
import { eq } from 'drizzle-orm';
import { whatsappService, sendWhatsAppText } from '../services/whatsappService';
import { whatsappAutomationService } from '../services/whatsappAutomationService';
import { getIO } from '../socket';

const WHATSAPP_LAST_EVENT_KEY = 'whatsapp_last_webhook_event';
const WHATSAPP_INBOX_KEY = 'whatsapp_inbox_v1';
const WHATSAPP_ESCALATIONS_KEY = 'whatsapp_escalations_v1';
const WHATSAPP_AUTOMATION_CONFIG_KEY = 'whatsapp_automation_config_v1';
const MAX_WHATSAPP_INBOX = 2000;
const MAX_WHATSAPP_ESCALATIONS = 1000;

type WhatsAppInboxMessage = {
    id: string;
    provider: 'meta' | 'openwa' | 'whatsapp-web.js';
    waMessageId: string;
    from: string;
    text: string;
    timestamp: string;
    receivedAt: string;
    branchId?: string | null;
};

type WhatsAppEscalation = {
    id: string;
    inboxId: string;
    from: string;
    text: string;
    reason: 'CUSTOMER_COMPLAINT' | 'NEGATIVE_SENTIMENT';
    status: 'OPEN' | 'RESOLVED';
    createdAt: string;
    resolvedAt?: string | null;
    resolvedBy?: string | null;
    resolutionNotes?: string | null;
};

const saveLastWebhookEvent = async (payload: unknown) => {
    await db.insert(settings).values({
        key: WHATSAPP_LAST_EVENT_KEY,
        value: payload as any,
        category: 'integration',
        updatedBy: 'webhook',
        updatedAt: new Date(),
    }).onConflictDoUpdate({
        target: settings.key,
        set: {
            value: payload as any,
            category: 'integration',
            updatedBy: 'webhook',
            updatedAt: new Date(),
        },
    });
};

const loadInbox = async (): Promise<WhatsAppInboxMessage[]> => {
    const [row] = await db.select().from(settings).where(eq(settings.key, WHATSAPP_INBOX_KEY)).limit(1);
    const value = row?.value;
    return Array.isArray(value) ? (value as WhatsAppInboxMessage[]) : [];
};

const saveInbox = async (messages: WhatsAppInboxMessage[]) => {
    await db.insert(settings).values({
        key: WHATSAPP_INBOX_KEY,
        value: messages.slice(0, MAX_WHATSAPP_INBOX) as any,
        category: 'integration',
        updatedBy: 'webhook',
        updatedAt: new Date(),
    }).onConflictDoUpdate({
        target: settings.key,
        set: {
            value: messages.slice(0, MAX_WHATSAPP_INBOX) as any,
            category: 'integration',
            updatedBy: 'webhook',
            updatedAt: new Date(),
        },
    });
};

const loadEscalations = async (): Promise<WhatsAppEscalation[]> => {
    const [row] = await db.select().from(settings).where(eq(settings.key, WHATSAPP_ESCALATIONS_KEY)).limit(1);
    const value = row?.value;
    return Array.isArray(value) ? (value as WhatsAppEscalation[]) : [];
};

const saveEscalations = async (items: WhatsAppEscalation[], updatedBy?: string | null) => {
    await db.insert(settings).values({
        key: WHATSAPP_ESCALATIONS_KEY,
        value: items.slice(0, MAX_WHATSAPP_ESCALATIONS) as any,
        category: 'integration',
        updatedBy: updatedBy || 'system',
        updatedAt: new Date(),
    }).onConflictDoUpdate({
        target: settings.key,
        set: {
            value: items.slice(0, MAX_WHATSAPP_ESCALATIONS) as any,
            category: 'integration',
            updatedBy: updatedBy || 'system',
            updatedAt: new Date(),
        },
    });
};

const normalizePhone = (value: string) => String(value || '').replace(/[^\d+]/g, '').trim();

const toInboxMessagesFromMetaPayload = (payload: any): WhatsAppInboxMessage[] => {
    const out: WhatsAppInboxMessage[] = [];
    const entries = Array.isArray(payload?.entry) ? payload.entry : [];
    for (const entry of entries) {
        const changes = Array.isArray(entry?.changes) ? entry.changes : [];
        for (const change of changes) {
            const value = change?.value || {};
            const metadataPhoneNumberId = String(value?.metadata?.phone_number_id || '').trim();
            const branchId = metadataPhoneNumberId || null;
            const messages = Array.isArray(value?.messages) ? value.messages : [];
            for (const m of messages) {
                const type = String(m?.type || '').toLowerCase();
                if (type !== 'text') continue;
                const text = String(m?.text?.body || '').trim();
                if (!text) continue;
                const tsRaw = Number(m?.timestamp || 0);
                out.push({
                    id: `wa-in-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    provider: 'meta',
                    waMessageId: String(m?.id || `meta-${Date.now()}`),
                    from: normalizePhone(String(m?.from || '')),
                    text,
                    timestamp: Number.isFinite(tsRaw) && tsRaw > 0 ? new Date(tsRaw * 1000).toISOString() : new Date().toISOString(),
                    receivedAt: new Date().toISOString(),
                    branchId,
                });
            }
        }
    }
    return out;
};

const toInboxMessagesFromOpenWaPayload = (payload: any): WhatsAppInboxMessage[] => {
    const event = String(payload?.event || payload?.type || payload?.payload?.event || '').toLowerCase();
    const data = payload?.data || payload?.payload?.data || payload?.message || payload;
    if (event && !event.includes('message')) return [];

    const text = String(data?.text || data?.body || data?.message?.text || data?.message?.body || '').trim();
    const fromRaw = String(data?.from || data?.chatId || data?.sender || data?.message?.from || '').trim();
    if (!text || !fromRaw) return [];

    return [{
        id: `wa-openwa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        provider: 'openwa',
        waMessageId: String(data?.id || data?.messageId || data?.message?.id || `openwa-${Date.now()}`),
        from: normalizePhone(fromRaw),
        text,
        timestamp: data?.timestamp ? new Date(data.timestamp).toISOString() : new Date().toISOString(),
        receivedAt: new Date().toISOString(),
        branchId: payload?.sessionId || payload?.session?.id || null,
    }];
};

const shouldEscalateMessage = (text: string) => {
    const lower = String(text || '').toLowerCase();
    const keywords = [
        'refund', 'cancel', 'angry', 'complaint', 'late', 'wrong order', 'missing', 'bad',
        'استرجاع', 'الغاء', 'إلغاء', 'شكوى', 'متأخر', 'ناقص', 'غلط', 'سيء',
    ];
    return keywords.some((k) => lower.includes(k.toLowerCase()));
};

const toEscalationReason = (text: string): WhatsAppEscalation['reason'] => {
    const lower = String(text || '').toLowerCase();
    if (lower.includes('complaint') || lower.includes('شكوى')) return 'CUSTOMER_COMPLAINT';
    return 'NEGATIVE_SENTIMENT';
};

export const getWhatsAppStatus = async (_req: Request, res: Response) => {
    try {
        const status = await whatsappService.getStatus();
        const [lastEvent] = await db.select().from(settings).where(eq(settings.key, WHATSAPP_LAST_EVENT_KEY)).limit(1);
        const inbox = await loadInbox();
        const escalations = await loadEscalations();
        res.json({
            ok: true,
            ...status,
            provider: (status as any).provider || whatsappService.getProvider(),
            lastWebhookAt: (lastEvent?.updatedAt || null),
            inboxCount: inbox.length,
            openEscalations: escalations.filter((e) => e.status === 'OPEN').length,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'WHATSAPP_STATUS_FAILED' });
    }
};

export const restartWhatsAppEngine = async (_req: Request, res: Response) => {
    try {
        await whatsappService.restart();
        res.json({ ok: true, status: 'INITIALIZING' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const resetWhatsAppSession = async (_req: Request, res: Response) => {
    try {
        await whatsappService.restart({ resetSession: true });
        res.json({ ok: true, status: 'AWAITING_SCAN' });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'WHATSAPP_RESET_FAILED' });
    }
};

export const getWhatsAppAutomationConfig = async (_req: Request, res: Response) => {
    try {
        const [row] = await db.select().from(settings).where(eq(settings.key, WHATSAPP_AUTOMATION_CONFIG_KEY)).limit(1);
        res.json({
            ok: true,
            config: row?.value || {
                orderCreated: true,
                outForDelivery: true,
                delivered: true,
                feedback: true,
                botEnabled: true,
                humanHandoffKeywords: ['شكوى', 'مشكلة', 'غلط', 'متأخر'],
                feedbackDelayMinutes: 60,
                quietHoursEnabled: false,
                quietHoursFrom: '02:00',
                quietHoursTo: '09:00',
            },
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'WHATSAPP_CONFIG_FAILED' });
    }
};

export const saveWhatsAppAutomationConfig = async (req: Request, res: Response) => {
    try {
        const config = req.body?.config || req.body || {};
        await db.insert(settings).values({
            key: WHATSAPP_AUTOMATION_CONFIG_KEY,
            value: config as any,
            category: 'integration',
            updatedBy: req.user?.id || 'system',
            updatedAt: new Date(),
        }).onConflictDoUpdate({
            target: settings.key,
            set: {
                value: config as any,
                category: 'integration',
                updatedBy: req.user?.id || 'system',
                updatedAt: new Date(),
            },
        });
        res.json({ ok: true, config });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'WHATSAPP_CONFIG_SAVE_FAILED' });
    }
};

export const sendWhatsAppCampaign = async (req: Request, res: Response) => {
    try {
        const { targets, text, isMarketing } = req.body;
        if (!Array.isArray(targets) || !text) {
            return res.status(400).json({ error: 'Targets and text are required' });
        }
        for (const to of targets) {
            whatsappService.enqueueMessage({ to, text, isMarketing: Boolean(isMarketing), sessionRole: 'MARKETING' });
        }
        res.json({ ok: true, queued: targets.length });
    } catch(err: any) {
        res.status(500).json({ error: err.message });
    }
};

export const sendWhatsAppTest = async (req: Request, res: Response) => {
    try {
        const to = String(req.body?.to || '').trim();
        const text = String(req.body?.text || '').trim();
        const result = await sendWhatsAppText({ to, text });
        res.status(201).json({ ok: true, result });
    } catch (error: any) {
        res.status(400).json({ error: error.message || 'WHATSAPP_SEND_FAILED' });
    }
};

export const verifyWhatsAppWebhook = async (req: Request, res: Response) => {
    const mode = String(req.query['hub.mode'] || '').trim();
    const token = String(req.query['hub.verify_token'] || '').trim();
    const challenge = String(req.query['hub.challenge'] || '').trim();
    const expected = String(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || '').trim();

    if (!expected) return res.status(503).send('WHATSAPP_WEBHOOK_VERIFY_TOKEN_NOT_SET');
    if (mode === 'subscribe' && token === expected) return res.status(200).send(challenge);
    return res.status(403).send('WHATSAPP_WEBHOOK_VERIFICATION_FAILED');
};

export const receiveWhatsAppWebhook = async (req: Request, res: Response) => {
    try {
        const inboxNew = [
            ...toInboxMessagesFromMetaPayload(req.body || {}),
            ...toInboxMessagesFromOpenWaPayload(req.body || {}),
        ];
        if (inboxNew.length > 0) {
            const currentInbox = await loadInbox();
            const seen = new Set(currentInbox.map((m) => m.waMessageId));
            const deduped = inboxNew.filter((m) => !seen.has(m.waMessageId));
            if (deduped.length > 0) {
                await saveInbox([...deduped, ...currentInbox]);
                for (const item of deduped) {
                    whatsappAutomationService.onInboundMessage({
                        from: item.from,
                        text: item.text,
                    }).catch(() => {});
                }

                const escalationsCurrent = await loadEscalations();
                const openByInbox = new Set(escalationsCurrent.filter((e) => e.status === 'OPEN').map((e) => e.inboxId));
                const additions: WhatsAppEscalation[] = [];
                for (const item of deduped) {
                    if (!shouldEscalateMessage(item.text)) continue;
                    if (openByInbox.has(item.id)) continue;
                    additions.push({
                        id: `wa-esc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                        inboxId: item.id,
                        from: item.from,
                        text: item.text,
                        reason: toEscalationReason(item.text),
                        status: 'OPEN',
                        createdAt: new Date().toISOString(),
                    });
                }
                if (additions.length > 0) {
                    await saveEscalations([...additions, ...escalationsCurrent], 'webhook');
                }
            }
        }

        await saveLastWebhookEvent({
            receivedAt: new Date().toISOString(),
            payload: req.body || {},
        });
        res.status(200).json({ ok: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'WHATSAPP_WEBHOOK_SAVE_FAILED' });
    }
};

export const getWhatsAppInbox = async (req: Request, res: Response) => {
    try {
        const limit = Math.max(1, Math.min(Number(req.query.limit || 100), 500));
        const from = normalizePhone(String(req.query.from || ''));
        const branchId = String(req.query.branchId || '').trim();
        const inbox = await loadInbox();
        const filtered = inbox.filter((m) => {
            if (from && m.from !== from) return false;
            if (branchId && String(m.branchId || '') !== branchId) return false;
            return true;
        }).slice(0, limit);
        res.json({ ok: true, total: filtered.length, inbox: filtered });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'WHATSAPP_INBOX_FAILED' });
    }
};

export const getWhatsAppEscalations = async (req: Request, res: Response) => {
    try {
        const status = String(req.query.status || '').toUpperCase();
        const items = await loadEscalations();
        const filtered = items.filter((e) => !status || e.status === status);
        res.json({ ok: true, total: filtered.length, escalations: filtered });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'WHATSAPP_ESCALATIONS_FAILED' });
    }
};

export const resolveWhatsAppEscalation = async (req: Request, res: Response) => {
    try {
        const id = String(req.params?.id || '').trim();
        if (!id) return res.status(400).json({ error: 'ESCALATION_ID_REQUIRED' });
        const notes = String(req.body?.resolutionNotes || '').trim();
        const userId = req.user?.id || null;
        const items = await loadEscalations();
        const idx = items.findIndex((i) => i.id === id);
        if (idx < 0) return res.status(404).json({ error: 'ESCALATION_NOT_FOUND' });
        if (items[idx].status === 'RESOLVED') return res.json({ ok: true, escalation: items[idx] });
        items[idx] = {
            ...items[idx],
            status: 'RESOLVED',
            resolvedAt: new Date().toISOString(),
            resolvedBy: userId,
            resolutionNotes: notes || null,
        };
        await saveEscalations(items, userId);
        res.json({ ok: true, escalation: items[idx] });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'WHATSAPP_ESCALATION_RESOLVE_FAILED' });
    }
};

// Start intercepting incoming messages
whatsappService.onMessage(async (msg) => {
    try {
        const currentInbox = await loadInbox();
        const newMessage: WhatsAppInboxMessage = {
            id: `wa-local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            provider: String(process.env.WHATSAPP_PROVIDER || '').toLowerCase() === 'openwa' ? 'openwa' : 'whatsapp-web.js',
            waMessageId: msg.id,
            from: msg.from,
            text: msg.body,
            timestamp: new Date().toISOString(),
            receivedAt: new Date().toISOString(),
        };
        await saveInbox([newMessage, ...currentInbox]);
        
        // Broadcast new message to UI live
        getIO().emit('whatsapp:inbox_new', newMessage);
    } catch (e) {
        console.error('Failed to save local inbox message', e);
    }
});
