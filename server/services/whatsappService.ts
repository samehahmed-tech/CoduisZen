import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;
import fsSync from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { getIO } from '../socket';
import { db } from '../db';
import { whatsappMessages } from '../../src/db/schema';

export type QueueMessage = {
    to: string;
    text: string;
    mediaUrl?: string;
    isMarketing?: boolean;
    branchId?: string | null;
    orderId?: string | null;
    sessionId?: string | null;
    sessionName?: string | null;
    sessionRole?: string | null;
};

type OpenWaSessionConfig = {
    id?: string;
    name?: string;
    role?: string;
    branchId?: string;
    isDefault?: boolean;
};

type WhatsAppProvider = 'openwa' | 'whatsapp-web.js';
type WhatsAppStatus =
    | 'INITIALIZING'
    | 'AWAITING_SCAN'
    | 'READY'
    | 'DISCONNECTED'
    | 'AUTH_ERROR';

class WhatsAppService {
    private provider: WhatsAppProvider = String(process.env.WHATSAPP_PROVIDER || 'whatsapp-web.js').toLowerCase() === 'openwa' ? 'openwa' : 'whatsapp-web.js';
    private client: any;
    private isReady = false;
    private qrCode: string | null = null;
    private lastError: string | null = null;
    private startedAt: Date | null = null;

    private queue: QueueMessage[] = [];
    private isProcessing = false;
    private messagesSentInBatch = 0;

    private customMessageHandler?: (message: { from: string, body: string, hasMedia: boolean, id: string }) => Promise<void>;
    private sessions: Map<string, { step: 'IDLE' | 'ORDERING' | 'CONFIRMING'; cart: any[]; lastActivity: number }> = new Map();

    private openWaBaseUrl = String(process.env.OPENWA_API_URL || 'http://localhost:2785/api').replace(/\/+$/, '');
    private openWaApiKey = String(process.env.OPENWA_API_KEY || '').trim();
    private openWaSessionId = String(process.env.OPENWA_SESSION_ID || '').trim();
    private openWaSessionName = String(process.env.OPENWA_SESSION_NAME || 'restoflow-erp').trim();
    private openWaSessions = this.loadOpenWaSessions();
    private lastOpenWaError: string | null = null;

    constructor() {
        if (this.provider === 'openwa') {
            console.log('WhatsApp provider: OpenWA gateway');
            return;
        }

        this.createLocalClient();
    }

    private getLocalClientId() {
        return String(process.env.WHATSAPP_WEB_CLIENT_ID || 'erp-hub');
    }

    private resolveChromeExecutable() {
        const explicit = String(process.env.WHATSAPP_CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || '').trim();
        const candidates = [
            explicit,
            process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'Google', 'Chrome', 'Application', 'chrome.exe') : '',
            process.env['ProgramFiles(x86)'] ? path.join(process.env['ProgramFiles(x86)']!, 'Google', 'Chrome', 'Application', 'chrome.exe') : '',
            process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe') : '',
            process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe') : '',
            process.env['ProgramFiles(x86)'] ? path.join(process.env['ProgramFiles(x86)']!, 'Microsoft', 'Edge', 'Application', 'msedge.exe') : '',
        ].filter(Boolean);
        return candidates.find((candidate) => fsSync.existsSync(candidate)) || undefined;
    }

    private withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
        return Promise.race([
            promise,
            new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
        ]);
    }

    private createLocalClient() {
        this.client = new Client({
            authStrategy: new LocalAuth({ clientId: this.getLocalClientId() }),
            puppeteer: {
                headless: String(process.env.WHATSAPP_HEADLESS || 'true').toLowerCase() !== 'false',
                executablePath: this.resolveChromeExecutable(),
                protocolTimeout: 60000,
                args: String(process.env.WHATSAPP_CHROME_ARGS || '--no-sandbox,--disable-setuid-sandbox,--disable-dev-shm-usage,--disable-gpu')
                    .split(',')
                    .map((arg) => arg.trim())
                    .filter(Boolean),
            },
        });

        this.client.on('qr', (qr: string) => {
            this.qrCode = qr;
            this.isReady = false;
            this.lastError = null;
            try { getIO().emit('whatsapp:qr', qr); } catch { /* noop */ }
            try { getIO().emit('whatsapp:status', { status: 'AWAITING_SCAN', provider: this.provider }); } catch { /* noop */ }
        });

        this.client.on('ready', () => {
            console.log('WhatsApp Web Client is READY');
            this.isReady = true;
            this.qrCode = null;
            this.lastError = null;
            try { getIO().emit('whatsapp:status', { status: 'READY' }); } catch { /* noop */ }
            this.processQueue();
        });

        this.client.on('disconnected', (reason: string) => {
            this.isReady = false;
            this.lastError = reason || null;
            console.log('WhatsApp disconnected:', reason);
            try { getIO().emit('whatsapp:status', { status: 'DISCONNECTED', reason }); } catch { /* noop */ }
            setTimeout(() => this.initialize(), 5000);
        });

        this.client.on('auth_failure', (msg: string) => {
            console.error('WhatsApp Auth failure', msg);
            this.isReady = false;
            this.lastError = msg || 'AUTH_ERROR';
            try { getIO().emit('whatsapp:status', { status: 'AUTH_ERROR', reason: msg }); } catch { /* noop */ }
        });

        this.client.on('message', async (msg: any) => {
            await this.handleIncomingLocalMessage(msg);
        });
    }

    public onMessage(handler: (message: { from: string, body: string, hasMedia: boolean, id: string }) => Promise<void>) {
        this.customMessageHandler = handler;
    }

    public initialize() {
        if (this.provider === 'openwa') {
            this.startOpenWaSessions().catch((err) => console.error('OpenWA start failed:', err));
            return;
        }
        this.startedAt = new Date();
        this.lastError = null;
        console.log('Initializing WhatsApp Engine...');
        this.client?.initialize().catch((err: any) => {
            const message = err?.message || 'Could not start whatsapp engine';
            this.isReady = false;
            this.lastError = String(message);
            console.error('Could not start whatsapp engine:', err);
            try { getIO().emit('whatsapp:status', { status: 'DISCONNECTED', provider: this.provider, reason: message }); } catch { /* noop */ }
        });
    }

    public async restart(options: { resetSession?: boolean } = {}) {
        if (this.provider === 'openwa') {
            this.initialize();
            return;
        }
        this.isReady = false;
        this.qrCode = null;
        this.lastError = null;
        try {
            await this.client?.destroy?.();
        } catch (error: any) {
            console.warn('WhatsApp client destroy warning:', error?.message || error);
        }

        if (options.resetSession) {
            const sessionPath = path.join(process.cwd(), '.wwebjs_auth', `session-${this.getLocalClientId()}`);
            try {
                await fs.rm(sessionPath, { recursive: true, force: true });
            } catch (error: any) {
                console.warn('WhatsApp session reset warning:', error?.message || error);
            }
        }

        this.createLocalClient();
        this.initialize();
    }

    public async getStatus() {
        if (this.provider === 'openwa') {
            return this.getOpenWaStatus();
        }
        const base = {
            provider: this.provider,
            configured: true,
            sessionName: this.getLocalClientId(),
            startedAt: this.startedAt?.toISOString() || null,
            reason: this.lastError || undefined,
        };
        if (this.isReady) return this.decorateStatus({ ...base, status: 'READY' });
        if (this.qrCode) return this.decorateStatus({ ...base, status: 'AWAITING_SCAN', qr: this.qrCode });
        return this.decorateStatus({ ...base, status: this.lastError ? 'DISCONNECTED' : 'INITIALIZING' });
    }

    public getProvider() {
        return this.provider;
    }

    public getQueueCount() {
        return this.queue.length;
    }

    private decorateStatus<T extends Record<string, any>>(status: T) {
        return {
            ...status,
            queueCount: this.queue.length,
            isProcessing: this.isProcessing,
            checkedAt: new Date().toISOString(),
        };
    }

    private loadOpenWaSessions(): OpenWaSessionConfig[] {
        const raw = String(process.env.OPENWA_SESSIONS || '').trim();
        if (!raw) {
            return [{
                id: this.openWaSessionId || undefined,
                name: this.openWaSessionName,
                role: 'DEFAULT',
                isDefault: true,
            }];
        }
        try {
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed.map((item) => ({
                id: String(item?.id || '').trim() || undefined,
                name: String(item?.name || '').trim() || undefined,
                role: String(item?.role || '').trim().toUpperCase() || undefined,
                branchId: String(item?.branchId || '').trim() || undefined,
                isDefault: Boolean(item?.isDefault || item?.default),
            })).filter((item) => item.id || item.name);
        } catch (error) {
            console.error('Invalid OPENWA_SESSIONS JSON:', error);
            return [];
        }
    }

    public enqueueMessage(msg: QueueMessage) {
        this.queue.push(msg);
        try { getIO().emit('whatsapp:queue', { count: this.queue.length }); } catch { /* noop */ }
        if (!this.isProcessing && (this.isReady || this.provider === 'openwa')) {
            this.processQueue();
        }
    }

    private async openWaRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string> || {}),
        };
        if (this.openWaApiKey) headers['X-API-Key'] = this.openWaApiKey;

        const response = await fetch(`${this.openWaBaseUrl}${path}`, {
            ...options,
            headers,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const message = data?.message || data?.error || `OpenWA request failed (${response.status})`;
            this.lastOpenWaError = String(message);
            throw new Error(message);
        }
        this.lastOpenWaError = null;
        return data as T;
    }

    private chooseOpenWaSession(msg?: Partial<QueueMessage>): OpenWaSessionConfig {
        const sessions = this.openWaSessions.length > 0 ? this.openWaSessions : this.loadOpenWaSessions();
        const wantedRole = String(msg?.sessionRole || '').toUpperCase();
        const byExplicit = sessions.find((s) => msg?.sessionId && s.id === msg.sessionId)
            || sessions.find((s) => msg?.sessionName && s.name === msg.sessionName);
        if (byExplicit) return byExplicit;
        const byBranchAndRole = sessions.find((s) => msg?.branchId && s.branchId === msg.branchId && wantedRole && s.role === wantedRole);
        if (byBranchAndRole) return byBranchAndRole;
        const byBranch = sessions.find((s) => msg?.branchId && s.branchId === msg.branchId);
        if (byBranch) return byBranch;
        const byRole = sessions.find((s) => wantedRole && s.role === wantedRole);
        if (byRole) return byRole;
        return sessions.find((s) => s.isDefault) || sessions[0] || {
            id: this.openWaSessionId || undefined,
            name: this.openWaSessionName,
            role: 'DEFAULT',
            isDefault: true,
        };
    }

    private async ensureOpenWaSession(session?: OpenWaSessionConfig): Promise<string> {
        const selected = session || this.chooseOpenWaSession();
        if (selected.id) return selected.id;
        if (this.openWaSessionId && (!selected.name || selected.name === this.openWaSessionName)) return this.openWaSessionId;
        const data: any = await this.openWaRequest('/sessions', {
            method: 'POST',
            body: JSON.stringify({ name: selected.name || this.openWaSessionName }),
        });
        const sessionId = String(data?.id || data?.sessionId || data?.session?.id || '').trim();
        if (!sessionId) {
            throw new Error('OpenWA did not return a session id');
        }
        selected.id = sessionId;
        if (selected.name === this.openWaSessionName || !this.openWaSessionId) this.openWaSessionId = sessionId;
        return sessionId;
    }

    private async startOpenWaSessions() {
        const sessions = this.openWaSessions.length > 0 ? this.openWaSessions : this.loadOpenWaSessions();
        for (const session of sessions) {
            const sessionId = await this.ensureOpenWaSession(session);
            await this.openWaRequest(`/sessions/${encodeURIComponent(sessionId)}/start`, { method: 'POST' });
        }
        try { getIO().emit('whatsapp:status', { status: 'INITIALIZING', provider: 'openwa' }); } catch { /* noop */ }
    }

    private async getOpenWaStatus() {
        const configured = Boolean(this.openWaBaseUrl);
        if (!configured) {
            return this.decorateStatus({
                status: 'DISCONNECTED' as WhatsAppStatus,
                provider: 'openwa',
                configured: false,
                bridgeUrl: this.openWaBaseUrl,
                sessionName: this.openWaSessionName,
                reason: 'OPENWA_API_URL is not configured',
            });
        }

        try {
            const sessionId = await this.ensureOpenWaSession(this.chooseOpenWaSession());
            let statusData: any = null;
            try {
                statusData = await this.openWaRequest(`/sessions/${encodeURIComponent(sessionId)}`);
            } catch {
                // Some OpenWA versions expose status through QR/session start flow only.
            }

            const statusText = String(statusData?.status || statusData?.session?.status || '').toUpperCase();
            if (['READY', 'CONNECTED', 'AUTHENTICATED'].includes(statusText)) {
                return this.decorateStatus({
                    status: 'READY' as WhatsAppStatus,
                    provider: 'openwa',
                    configured: true,
                    bridgeUrl: this.openWaBaseUrl,
                    sessionId,
                    sessionName: this.openWaSessionName,
                });
            }

            try {
                const qrData: any = await this.openWaRequest(`/sessions/${encodeURIComponent(sessionId)}/qr`);
                const qr = qrData?.qr || qrData?.data || qrData?.base64 || qrData?.code;
                if (qr) return this.decorateStatus({
                    status: 'AWAITING_SCAN' as WhatsAppStatus,
                    provider: 'openwa',
                    configured: true,
                    bridgeUrl: this.openWaBaseUrl,
                    sessionId,
                    sessionName: this.openWaSessionName,
                    qr,
                });
            } catch {
                // No QR usually means the session is still starting or already authenticated.
            }

            return this.decorateStatus({
                status: (statusText === 'DISCONNECTED' ? 'DISCONNECTED' : 'INITIALIZING') as WhatsAppStatus,
                provider: 'openwa',
                configured: true,
                bridgeUrl: this.openWaBaseUrl,
                sessionId,
                sessionName: this.openWaSessionName,
                reason: this.lastOpenWaError || undefined,
            });
        } catch (error: any) {
            return this.decorateStatus({
                status: 'DISCONNECTED' as WhatsAppStatus,
                provider: 'openwa',
                configured,
                bridgeUrl: this.openWaBaseUrl,
                sessionName: this.openWaSessionName,
                reason: error?.message || 'OpenWA unavailable',
            });
        }
    }

    private parseSpintax(text: string): string {
        return text.replace(/\{([^{}]+)\}/g, (_match, options) => {
            const parts = String(options).split('|');
            return parts[Math.floor(Math.random() * parts.length)];
        });
    }

    private normalizePhone(phone: string): string {
        let cleaned = phone.replace(/[^\d]/g, '');
        if (cleaned.startsWith('01')) cleaned = `2${cleaned}`;
        return cleaned;
    }

    private async processQueue() {
        if (this.queue.length === 0 || (this.provider !== 'openwa' && !this.isReady)) {
            this.isProcessing = false;
            return;
        }

        this.isProcessing = true;
        const msg = this.queue.shift()!;
        try { getIO().emit('whatsapp:queue', { count: this.queue.length }); } catch { /* noop */ }

        const normalizedPhone = this.normalizePhone(msg.to);
        const finalPhone = `${normalizedPhone}@c.us`;
        const finalText = this.parseSpintax(msg.text);

        try {
            if (this.provider === 'openwa') {
                const sessionId = await this.ensureOpenWaSession(this.chooseOpenWaSession(msg));
                await this.openWaRequest(`/sessions/${encodeURIComponent(sessionId)}/messages/send-text`, {
                    method: 'POST',
                    body: JSON.stringify({ chatId: finalPhone, text: finalText }),
                });
                console.log(`OpenWA sent to ${finalPhone}`);
            } else {
                let isRegistered = true;
                try {
                    isRegistered = await this.withTimeout(
                        this.client.isRegisteredUser(finalPhone),
                        5000,
                        true,
                    );
                } catch (regErr: any) {
                    console.warn(`isRegisteredUser failed for ${finalPhone}, sending anyway:`, regErr?.message || regErr);
                    isRegistered = true;
                }
                if (isRegistered) {
                    if (msg.mediaUrl) {
                        try {
                            const media = await MessageMedia.fromUrl(msg.mediaUrl);
                            await this.client.sendMessage(finalPhone, media, { caption: finalText });
                        } catch {
                            console.error('Media fetch failed, falling back to text');
                            await this.client.sendMessage(finalPhone, finalText);
                        }
                    } else {
                        await this.client.sendMessage(finalPhone, finalText);
                    }
                    console.log(`WhatsApp sent to ${finalPhone}`);
                } else {
                    console.log(`WhatsApp skip: ${finalPhone} is not registered on WP`);
                }
            }

            const transactionalDelayMs = Math.max(500, Number(process.env.WHATSAPP_TRANSACTIONAL_DELAY_MS || 1500));
            const marketingMinDelayMs = Math.max(1000, Number(process.env.WHATSAPP_MARKETING_MIN_DELAY_MS || 8000));
            const marketingMaxDelayMs = Math.max(marketingMinDelayMs, Number(process.env.WHATSAPP_MARKETING_MAX_DELAY_MS || 22000));
            let waitMs = msg.isMarketing
                ? Math.floor(Math.random() * (marketingMaxDelayMs - marketingMinDelayMs + 1)) + marketingMinDelayMs
                : transactionalDelayMs;
            if (msg.isMarketing) {
                this.messagesSentInBatch++;
                const batchSize = Math.max(1, Number(process.env.WHATSAPP_MARKETING_BATCH_SIZE || 35));
                const batchPauseMs = Math.max(60_000, Number(process.env.WHATSAPP_MARKETING_BATCH_PAUSE_MS || 10 * 60 * 1000));
                if (this.messagesSentInBatch >= batchSize) {
                    waitMs = batchPauseMs;
                    this.messagesSentInBatch = 0;
                }
            }
            if (this.queue.length > 0) {
                await new Promise(resolve => setTimeout(resolve, waitMs));
            }
        } catch (error) {
            console.error(`Failed to send WhatsApp message to ${msg.to}:`, error);
        }

        this.processQueue();
    }

    private async handleIncomingLocalMessage(msg: any) {
        const rawFrom = String(msg.from || '');
        if (rawFrom.includes('status@broadcast')) return;

        const text = String(msg.body || '').trim();
        const from = this.normalizePhone(rawFrom);
        const lower = text.toLowerCase();

        let session = this.sessions.get(from);
        if (!session || (Date.now() - session.lastActivity > 15 * 60 * 1000)) {
            session = { step: 'IDLE', cart: [], lastActivity: Date.now() };
            this.sessions.set(from, session);
        }
        session.lastActivity = Date.now();

        if (lower === 'منيو' || lower === 'menu' || lower === 'المنيو') {
            this.enqueueMessage({ to: from, text: 'أهلا بك! يمكنك استعراض المنيو أو أخبرني ماذا تريد أن تطلب الآن.' });
            return;
        }

        if (session.step === 'CONFIRMING') {
            if (lower.includes('نعم') || lower.includes('yes') || lower.includes('ok') || lower.includes('تأكيد')) {
                this.enqueueMessage({ to: from, text: `تم تأكيد طلبك بنجاح. رقم الطلب #WP${Math.floor(Math.random() * 1000)}.` });
                session.step = 'IDLE';
                session.cart = [];
            } else {
                this.enqueueMessage({ to: from, text: 'تم إلغاء الطلب. هل تريد تغيير أي شيء؟' });
                session.step = 'IDLE';
            }
            return;
        }

        if (text.length > 3) {
            try {
                const { aiService } = await import('./aiService');
                const aiResponse = await aiService.queryAI(
                    `User said: "${text}". If they want to order food, reply with a JSON array of objects like [{name: "item", qty: 1}]. If it is just a greeting, say "HELLO". If it is a question, answer it. Keep it brief.`,
                    'You are an expert restaurant ordering bot. If an order is detected, always return JSON blocks like [INDEX_START][{"name":"...", "qty":1}][INDEX_END]',
                );

                if (aiResponse.includes('[INDEX_START]')) {
                    const jsonStr = aiResponse.split('[INDEX_START]')[1].split('[INDEX_END]')[0];
                    const items = JSON.parse(jsonStr);
                    session.cart = items;
                    session.step = 'CONFIRMING';
                    const summary = items.map((i: any) => `- ${i.name} (x${i.qty})`).join('\n');
                    this.enqueueMessage({ to: from, text: `فهمت أنك تريد طلب:\n${summary}\n\nهل هذا صحيح؟ أجب بـ "نعم" للتأكيد.` });
                } else {
                    this.enqueueMessage({ to: from, text: aiResponse });
                }
            } catch (e) {
                console.error('AI WhatsApp Processing failed', e);
            }
        }

        if (this.customMessageHandler) {
            await this.customMessageHandler({
                from,
                body: text,
                hasMedia: msg.hasMedia,
                id: String(msg.id?._serialized || `msg-${Date.now()}`),
            });
        }
    }

    public async handleIncomingWebhookMessage(message: { from: string; body: string; hasMedia?: boolean; id?: string }) {
        await this.handleIncomingLocalMessage({
            from: message.from,
            body: message.body,
            hasMedia: Boolean(message.hasMedia),
            id: { _serialized: message.id || `openwa-${Date.now()}` },
        });
    }
}

export const whatsappService = new WhatsAppService();

export const sendWhatsAppText = async (payload: {
    to: string;
    text: string;
    branchId?: string | null;
    orderId?: string | null;
    sessionRole?: string | null;
    sessionId?: string | null;
    sessionName?: string | null;
    isMarketing?: boolean;
}) => {
    whatsappService.enqueueMessage({
        to: payload.to,
        text: payload.text,
        branchId: payload.branchId,
        orderId: payload.orderId,
        sessionRole: payload.sessionRole,
        sessionId: payload.sessionId,
        sessionName: payload.sessionName,
        isMarketing: Boolean(payload.isMarketing),
    });
    const messageId = `wa-out-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
        await db.insert(whatsappMessages).values({
            id: messageId,
            customerPhone: payload.to,
            direction: 'OUTBOUND',
            content: payload.text,
            messageType: 'TEXT',
            status: 'SENT',
            orderId: payload.orderId || undefined,
            externalId: messageId,
            sentAt: new Date(),
            createdAt: new Date(),
        });
    } catch (error) {
        console.warn('Failed to log outbound WhatsApp message:', error);
    }
    return {
        provider: String(process.env.WHATSAPP_PROVIDER || 'whatsapp-web.js').toLowerCase() === 'openwa' ? 'openwa' : 'whatsapp-web.js',
        messageId,
        to: payload.to,
        acceptedAt: new Date().toISOString(),
    };
};
