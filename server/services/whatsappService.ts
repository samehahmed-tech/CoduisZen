import makeWASocket, {
    DisconnectReason,
    fetchLatestBaileysVersion,
    useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import fs from 'fs/promises';
import path from 'path';
import { getIO } from '../socket';
import { db } from '../db';
import { eq } from 'drizzle-orm';
import { customers, whatsappMessages } from '../../src/db/schema';
import { mapConnectionUpdate, reconnectDelay } from './whatsappConnection';

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
    messageId?: string;
    _retried?: boolean;
};

type OpenWaSessionConfig = {
    id?: string;
    name?: string;
    role?: string;
    branchId?: string;
    isDefault?: boolean;
};

type WhatsAppProvider = 'openwa' | 'whatsapp-web.js' | 'disabled';
type WhatsAppStatus =
    | 'INITIALIZING'
    | 'AWAITING_SCAN'
    | 'AUTHENTICATED'
    | 'READY'
    | 'DISCONNECTED'
    | 'DISABLED'
    | 'AUTH_ERROR';

// --- Task 3 pure helpers: inbound normalize, STOP opt-out, receipts, requeue ---

export type NormalizedInbound = { from: string; body: string; hasMedia: boolean; id: string };

const toDigits = (phone: string): string => {
    let cleaned = String(phone || '').replace(/[^\d]/g, '');
    if (cleaned.startsWith('01')) cleaned = `2${cleaned}`;
    return cleaned;
};

// Baileys raw upsert -> handler shape. Null = drop (group, broadcast, empty).
export const normalizeBaileysInbound = (m: any): NormalizedInbound | null => {
    const remoteJid = String(m?.key?.remoteJid || '');
    if (!remoteJid || remoteJid.includes('@g.us') || remoteJid.includes('status@broadcast')) return null;
    const from = toDigits(remoteJid.split('@')[0] || '');
    if (!from) return null;
    const text = String(
        m?.message?.conversation
        || m?.message?.extendedTextMessage?.text
        || m?.message?.imageMessage?.caption
        || m?.message?.videoMessage?.caption
        || m?.message?.documentMessage?.caption
        || '',
    );
    const hasMedia = Boolean(
        m?.message?.imageMessage
        || m?.message?.videoMessage
        || m?.message?.documentMessage
        || m?.message?.audioMessage
        || m?.message?.stickerMessage,
    );
    return { from, body: text, hasMedia, id: String(m?.key?.id || `bl-${Date.now()}`) };
};

const STOP_AR_PATTERNS = ['ايقاف', 'إيقاف', 'الغاء الاشتراك', 'إلغاء الاشتراك'];
const STOP_LATIN_RE = /\bstop\b/i;

export const isStopOptOut = (text: string): boolean => {
    const trimmed = String(text || '').trim();
    if (!trimmed) return false;
    if (STOP_LATIN_RE.test(trimmed)) return true;
    const lower = trimmed.toLowerCase();
    return STOP_AR_PATTERNS.some((p) => lower.includes(p));
};

const optedOutPhones = new Set<string>();

export const noteOptOut = (phone: string): void => {
    const digits = toDigits(phone);
    if (digits) optedOutPhones.add(digits);
};

export const isOptedOut = (phone: string): boolean => optedOutPhones.has(toDigits(phone));

export const shouldSkipQueuedMessage = (msg: Pick<QueueMessage, 'to' | 'isMarketing'>): boolean =>
    Boolean(msg.isMarketing) && isOptedOut(msg.to);

export const mapReceiptToStatus = (receipt: any): 'READ' | 'DELIVERED' | null => {
    if (!receipt) return null;
    const candidates = Array.isArray(receipt) ? receipt : [receipt];
    let found: 'READ' | 'DELIVERED' | null = null;
    for (const r of candidates) {
        if (!r || typeof r !== 'object') continue;
        const inner = (r as any).receipt && typeof (r as any).receipt === 'object' ? (r as any).receipt : r;
        if (inner.readTimestamp) return 'READ';
        if (inner.receiptTimestamp) found = 'DELIVERED';
    }
    return found;
};

export const shouldRequeueAfterFailure = (msg: Pick<QueueMessage, '_retried'>): boolean =>
    !(msg as any)?._retried;

const resolveProvider = (): WhatsAppProvider => {
    const raw = String(process.env.WHATSAPP_PROVIDER || 'whatsapp-web.js').toLowerCase().trim();
    if (raw === 'disabled' || raw === 'off' || raw === 'false' || raw === '') return 'disabled';
    if (raw === 'openwa') return 'openwa';
    return 'whatsapp-web.js';
};

class WhatsAppService {
    private provider: WhatsAppProvider = resolveProvider();
    private client: any = null;
    private creatingSocket = false;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private reconnectAttempt = 0;
    private pairingCode: string | null = null;
    private isReady = false;
    private qrCode: string | null = null;
    private qrIssuedAt: string | null = null;
    // Set the moment the phone scan is accepted, cleared on ready/timeout.
    // Without it the UI cannot tell "scan worked, session warming up" from
    // "still waiting for scan" — the exact stuck screen users report.
    private authenticatedAt: string | null = null;
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
        // أعد قراءة المتغير في كل إقلاع (الـ import cache قد يسبق ضبط dotenv في الاختبارات).
        this.provider = resolveProvider();
        if (this.provider === 'disabled') {
            console.log('WhatsApp provider: disabled (set WHATSAPP_PROVIDER=whatsapp-web.js to enable QR pairing)');
            return;
        }
        if (this.provider === 'openwa') {
            console.log('WhatsApp provider: OpenWA gateway');
            return;
        }

        if (String(process.env.WHATSAPP_CHROME_PATH || process.env.WHATSAPP_CHROME_ARGS || process.env.PUPPETEER_EXECUTABLE_PATH || '').trim()) {
            console.log('WhatsApp Baileys transport needs no browser: WHATSAPP_CHROME_*/PUPPETEER_* is ignored.');
        }

        void this.createLocalClient();
    }

    private getLocalClientId() {
        return String(process.env.WHATSAPP_WEB_CLIENT_ID || 'erp-hub');
    }

    private getAuthDir() {
        return path.join(process.cwd(), 'sessions', `baileys-${this.getLocalClientId()}`);
    }

    private withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
        return Promise.race([
            promise,
            new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
        ]);
    }

    private async createLocalClient() {
        if (this.client || this.creatingSocket) return;
        this.creatingSocket = true;
        try {
            let version: any = undefined;
            try {
                version = (await fetchLatestBaileysVersion()).version;
            } catch (err: any) {
                console.warn('Baileys version fetch failed, using bundled default:', err?.message || err);
            }
            const { state, saveCreds } = await useMultiFileAuthState(this.getAuthDir());
            const sock = makeWASocket({
                ...(version ? { version } : {}),
                logger: pino({ level: 'silent' }) as any,
                auth: state,
                browser: ['CoduisZen', 'Chrome', '1.0'],
            });
            this.client = sock;

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on('connection.update', (update: any) => {
                void this.handleConnectionUpdate(update);
            });

            sock.ev.on('messages.upsert', async ({ messages, type }: any) => {
                if (type !== 'notify') return;
                for (const m of messages || []) {
                    try {
                        if (m?.key?.fromMe) continue;
                        const inbound = normalizeBaileysInbound(m);
                        if (!inbound) continue;
                        await this.handleIncomingLocalMessage({
                            from: inbound.from,
                            body: inbound.body,
                            hasMedia: inbound.hasMedia,
                            id: { _serialized: inbound.id },
                        });
                    } catch (err) {
                        console.warn('Baileys inbound message skipped:', (err as any)?.message || err);
                    }
                }
            });

            sock.ev.on('message-receipt.update', async (updates: any[]) => {
                for (const u of updates || []) {
                    try {
                        const status = mapReceiptToStatus((u as any)?.receipt ?? u);
                        const externalId = String((u as any)?.key?.id || '');
                        if (!status || !externalId) {
                            console.warn('Baileys receipt update skipped: unmapped shape for', externalId || 'unknown-id');
                            continue;
                        }
                        await db.update(whatsappMessages)
                            .set(status === 'READ' ? { status, readAt: new Date() } : { status, deliveredAt: new Date() })
                            .where(eq(whatsappMessages.externalId, externalId));
                    } catch (err) {
                        console.warn('Baileys receipt update skipped:', (err as any)?.message || err);
                    }
                }
            });
        } catch (err: any) {
            const message = err?.message || 'Could not start whatsapp engine';
            this.isReady = false;
            this.lastError = String(message);
            console.error('Could not start whatsapp engine:', err);
            try { getIO().emit('whatsapp:status', { status: 'DISCONNECTED', provider: this.provider, reason: message }); } catch { /* noop */ }
            this.scheduleReconnect();
        } finally {
            this.creatingSocket = false;
        }
    }

    private async handleConnectionUpdate(update: { connection?: string; lastDisconnect?: any; qr?: string }) {
        const qr = (update as any)?.qr as string | undefined;
        if (qr) {
            this.qrCode = qr;
            this.qrIssuedAt = new Date().toISOString();
            this.authenticatedAt = null;
            this.isReady = false;
            this.lastError = null;
            try { getIO().emit('whatsapp:qr', qr); } catch { /* noop */ }
            try { getIO().emit('whatsapp:status', { status: 'AWAITING_SCAN', provider: this.provider, qr, qrAt: this.qrIssuedAt }); } catch { /* noop */ }
        }

        const connection = (update as any)?.connection as string | undefined;
        // Baileys has no 'authenticated' event: a 'connecting' update AFTER a
        // QR was issued means the phone accepted the scan and the session is
        // warming up. Same linking state as before, same AUTHENTICATED emit.
        if (connection === 'connecting') {
            if (this.qrCode && !this.authenticatedAt) {
                console.log('WhatsApp scan accepted, warming up');
                this.authenticatedAt = new Date().toISOString();
                this.qrCode = null;
                this.qrIssuedAt = null;
                this.isReady = false;
                this.lastError = null;
            }
            if (this.authenticatedAt) {
                try { getIO().emit('whatsapp:status', { status: 'AUTHENTICATED', provider: this.provider, authenticatedAt: this.authenticatedAt }); } catch { /* noop */ }
            }
            return;
        }
        if (!connection) return;

        if (connection === 'open') {
            console.log('WhatsApp Baileys socket is READY');
            this.isReady = true;
            this.qrCode = null;
            this.qrIssuedAt = null;
            this.authenticatedAt = null;
            this.pairingCode = null;
            this.lastError = null;
            this.reconnectAttempt = 0;
            try { getIO().emit('whatsapp:status', { status: 'READY', provider: this.provider }); } catch { /* noop */ }
            this.processQueue();
            return;
        }

        if (connection === 'close') {
            const mapped = mapConnectionUpdate(
                { connection: 'close', lastDisconnect: (update as any)?.lastDisconnect, qr },
                { qrScanned: Boolean(this.authenticatedAt) },
            );
            const statusCode = (update as any)?.lastDisconnect?.error?.output?.statusCode;
            const loggedOut = statusCode === DisconnectReason.loggedOut || mapped.status === 'AUTH_ERROR';
            this.isReady = false;
            this.authenticatedAt = null;
            this.client = null;
            if (loggedOut) {
                console.error('WhatsApp Baileys logged out (401): wiping creds for fresh QR');
                this.lastError = mapped.reason || 'Logged out, scan fresh QR';
                try {
                    await fs.rm(this.getAuthDir(), { recursive: true, force: true });
                } catch (error: any) {
                    console.warn('WhatsApp session reset warning:', error?.message || error);
                }
                this.reconnectAttempt = 0;
                try { getIO().emit('whatsapp:status', { status: 'AUTH_ERROR', provider: this.provider, reason: this.lastError }); } catch { /* noop */ }
                this.scheduleReconnect();
                return;
            }
            this.lastError = mapped.reason || 'Connection closed';
            console.log('WhatsApp disconnected:', this.lastError);
            try { getIO().emit('whatsapp:status', { status: 'DISCONNECTED', provider: this.provider, reason: this.lastError }); } catch { /* noop */ }
            this.scheduleReconnect();
        }
    }

    private scheduleReconnect() {
        if (this.reconnectTimer) return;
        const delayMs = reconnectDelay(this.reconnectAttempt);
        this.reconnectAttempt += 1;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (this.provider !== 'whatsapp-web.js') return;
            void this.createLocalClient();
        }, delayMs);
    }

    private clearReconnectTimer() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    public async getPairingCode(phone: string) {
        const cleaned = this.normalizePhone(phone);
        if (!this.client?.requestPairingCode) {
            throw new Error('WhatsApp engine is not connected yet; wait for QR first');
        }
        const code = String(await this.client.requestPairingCode(cleaned));
        this.pairingCode = code;
        try { getIO().emit('whatsapp:pairing', { pairingCode: code }); } catch { /* noop */ }
        return code;
    }

    public onMessage(handler: (message: { from: string, body: string, hasMedia: boolean, id: string }) => Promise<void>) {
        this.customMessageHandler = handler;
    }

    public initialize() {
        this.provider = resolveProvider();
        if (this.provider === 'disabled') {
            this.lastError = 'WhatsApp engine is disabled (WHATSAPP_PROVIDER=disabled). Enable it to show QR.';
            try { getIO().emit('whatsapp:status', { status: 'DISABLED', provider: this.provider, reason: this.lastError }); } catch { /* noop */ }
            return;
        }
        if (this.provider === 'openwa') {
            this.startOpenWaSessions().catch((err) => console.error('OpenWA start failed:', err));
            return;
        }
        this.startedAt = new Date();
        this.lastError = null;
        console.log('Initializing WhatsApp Engine (Baileys)...');
        try { getIO().emit('whatsapp:status', { status: 'INITIALIZING', provider: this.provider }); } catch { /* noop */ }
        void this.createLocalClient();
    }

    public async restart(options: { resetSession?: boolean } = {}) {
        this.provider = resolveProvider();
        if (this.provider === 'disabled') {
            this.lastError = 'WhatsApp engine is disabled (WHATSAPP_PROVIDER=disabled).';
            try { getIO().emit('whatsapp:status', { status: 'DISABLED', provider: this.provider, reason: this.lastError }); } catch { /* noop */ }
            return;
        }
        if (this.provider === 'openwa') {
            this.initialize();
            return;
        }
        this.isReady = false;
        this.qrCode = null;
        this.qrIssuedAt = null;
        this.authenticatedAt = null;
        this.pairingCode = null;
        this.lastError = null;
        this.reconnectAttempt = 0;
        this.clearReconnectTimer();
        try { getIO().emit('whatsapp:status', { status: 'INITIALIZING', provider: this.provider }); } catch { /* noop */ }
        try {
            await this.client?.end?.();
        } catch (error: any) {
            console.warn('WhatsApp client destroy warning:', error?.message || error);
        }
        this.client = null;

        if (options.resetSession) {
            try {
                await fs.rm(this.getAuthDir(), { recursive: true, force: true });
            } catch (error: any) {
                console.warn('WhatsApp session reset warning:', error?.message || error);
            }
        }

        await this.createLocalClient();
        this.initialize();
    }

    public async getStatus() {
        this.provider = resolveProvider();
        if (this.provider === 'disabled') {
            return this.decorateStatus({
                status: 'DISABLED' as WhatsAppStatus,
                provider: this.provider,
                configured: false,
                sessionName: this.getLocalClientId(),
                reason: 'WhatsApp engine is disabled (WHATSAPP_PROVIDER=disabled). Set WHATSAPP_PROVIDER=whatsapp-web.js and restart.',
            });
        }
        if (this.provider === 'openwa') {
            return this.getOpenWaStatus();
        }
        const base = {
            provider: this.provider,
            configured: true,
            sessionName: this.getLocalClientId(),
            startedAt: this.startedAt?.toISOString() || null,
            reason: this.lastError || undefined,
            ...(this.pairingCode ? { pairingCode: this.pairingCode } : {}),
        };
        if (this.isReady) return this.decorateStatus({ ...base, status: 'READY' });
        // Scan accepted but session not warm yet — report it instead of a
        // stale AWAITING_SCAN so the UI stops showing the consumed QR.
        if (this.authenticatedAt) return this.decorateStatus({ ...base, status: 'AUTHENTICATED', authenticatedAt: this.authenticatedAt });
        if (this.qrCode) return this.decorateStatus({ ...base, status: 'AWAITING_SCAN', qr: this.qrCode, qrAt: this.qrIssuedAt });
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
        if (this.provider === 'disabled') {
            this.isProcessing = false;
            return;
        }
        if (this.queue.length === 0 || (this.provider !== 'openwa' && !this.isReady)) {
            this.isProcessing = false;
            return;
        }

        this.isProcessing = true;
        const msg = this.queue.shift()!;
        try { getIO().emit('whatsapp:queue', { count: this.queue.length }); } catch { /* noop */ }

        if (msg.isMarketing && isOptedOut(this.normalizePhone(msg.to))) {
            console.log(`WhatsApp skip: ${msg.to} opted out (STOP), dropping queued marketing`);
            this.processQueue();
            return;
        }

        const normalizedPhone = this.normalizePhone(msg.to);
        const finalPhone = `${normalizedPhone}@c.us`;
        const finalText = this.parseSpintax(msg.text);

        try {
            let sentResult: any = null;
            if (this.provider === 'openwa') {
                const sessionId = await this.ensureOpenWaSession(this.chooseOpenWaSession(msg));
                await this.openWaRequest(`/sessions/${encodeURIComponent(sessionId)}/messages/send-text`, {
                    method: 'POST',
                    body: JSON.stringify({ chatId: finalPhone, text: finalText }),
                });
                console.log(`OpenWA sent to ${finalPhone}`);
            } else {
                const jid = `${normalizedPhone}@s.whatsapp.net`;
                let isRegistered = true;
                try {
                    const contacts = await this.withTimeout(
                        this.client.onWhatsApp(jid),
                        5000,
                        [] as any[],
                    );
                    isRegistered = (contacts as any[])?.[0]?.exists ?? true;
                } catch (regErr: any) {
                    console.warn(`onWhatsApp failed for ${jid}, sending anyway:`, regErr?.message || regErr);
                    isRegistered = true;
                }
                if (isRegistered) {
                    if (msg.mediaUrl) {
                        try {
                            const response = await fetch(msg.mediaUrl);
                            if (!response.ok) throw new Error(`media fetch ${response.status}`);
                            const buffer = Buffer.from(await response.arrayBuffer());
                            const mime = String(response.headers.get('content-type') || '');
                            sentResult = mime.startsWith('image/')
                                ? await this.client.sendMessage(jid, { image: buffer, caption: finalText })
                                : await this.client.sendMessage(jid, { document: buffer, fileName: 'attachment', caption: finalText, ...(mime ? { mimetype: mime } : {}) });
                        } catch {
                            console.error('Media fetch failed, falling back to text');
                            sentResult = await this.client.sendMessage(jid, { text: finalText });
                        }
                    } else {
                        sentResult = await this.client.sendMessage(jid, { text: finalText });
                    }
                    console.log(`WhatsApp sent to ${jid}`);
                    const externalId = String(sentResult?.key?.id || '');
                    if (msg.messageId && externalId) {
                        try {
                            await db.update(whatsappMessages).set({ externalId }).where(eq(whatsappMessages.id, msg.messageId));
                        } catch (err) {
                            console.warn('WhatsApp externalId link skipped:', (err as any)?.message || err);
                        }
                    }
                } else {
                    console.log(`WhatsApp skip: ${jid} is not registered on WP`);
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
            if (shouldRequeueAfterFailure(msg)) {
                msg._retried = true;
                this.queue.unshift(msg);
                console.log(`WhatsApp requeue once for ${msg.to}`);
                try { getIO().emit('whatsapp:queue', { count: this.queue.length }); } catch { /* noop */ }
                // Retry goes through the normal send delay, not immediately.
                const retryDelayMs = Math.max(500, Number(process.env.WHATSAPP_TRANSACTIONAL_DELAY_MS || 1500));
                await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
            } else if (msg.messageId) {
                try {
                    await db.update(whatsappMessages)
                        .set({ status: 'FAILED', failureReason: String((error as any)?.message || error).slice(0, 500) })
                        .where(eq(whatsappMessages.id, msg.messageId));
                } catch (dbErr) {
                    console.warn('WhatsApp FAILED mark skipped:', (dbErr as any)?.message || dbErr);
                }
            }
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

        if (isStopOptOut(text)) {
            noteOptOut(from);
            this.queue = this.queue.filter((m) => !shouldSkipQueuedMessage(m));
            const candidates = new Set([from, from.startsWith('2') ? `0${from.slice(1)}` : from]);
            for (const phone of candidates) {
                try {
                    await db.update(customers)
                        .set({ marketingOptIn: false, marketingOptOutAt: new Date() })
                        .where(eq(customers.phone, phone));
                } catch (err) {
                    console.warn('STOP opt-out persist skipped:', (err as any)?.message || err);
                }
            }
            console.log(`WhatsApp STOP opt-out for ${from}, queued marketing dropped`);
            this.enqueueMessage({ to: from, text: 'تم إيقاف الرسائل التسويقية بنجاح.' });
            if (this.customMessageHandler) {
                await this.customMessageHandler({
                    from,
                    body: text,
                    hasMedia: msg.hasMedia,
                    id: String(msg.id?._serialized || `msg-${Date.now()}`),
                });
            }
            return;
        }

        if (lower === 'منيو' || lower === 'menu' || lower === 'المنيو') {
            this.enqueueMessage({ to: from, text: 'أهلا بك! يمكنك استعراض المنيو أو أخبرني ماذا تريد أن تطلب الآن.' });
            return;
        }

        if (session.step === 'CONFIRMING') {
            if (lower.includes('نعم') || lower.includes('yes') || lower.includes('ok') || lower.includes('تأكيد')) {
                this.enqueueMessage({ to: from, text: 'لا يمكن تأكيد الطلب من المحادثة حاليًا. تواصل مع الفرع لإتمام الطلب.' });
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
    const messageId = `wa-out-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    whatsappService.enqueueMessage({
        to: payload.to,
        text: payload.text,
        branchId: payload.branchId,
        orderId: payload.orderId,
        sessionRole: payload.sessionRole,
        sessionId: payload.sessionId,
        sessionName: payload.sessionName,
        isMarketing: Boolean(payload.isMarketing),
        messageId,
    });
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
