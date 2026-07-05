import crypto from 'crypto';
import { db } from '../db';
import { etaDeadLetters, fiscalLogs } from '../../src/db/schema';
import { eq } from 'drizzle-orm';
import logger from '../utils/logger';

const log = logger.child({ service: 'eta' });

const ETA_BASE_URL = process.env.ETA_BASE_URL;
const ETA_TOKEN_URL = process.env.ETA_TOKEN_URL;
const ETA_CLIENT_ID = process.env.ETA_CLIENT_ID;
const ETA_CLIENT_SECRET = process.env.ETA_CLIENT_SECRET;
const ETA_API_KEY = process.env.ETA_API_KEY;
const ETA_PRIVATE_KEY = process.env.ETA_PRIVATE_KEY;
const ETA_PRIVATE_KEY_PASSPHRASE = process.env.ETA_PRIVATE_KEY_PASSPHRASE;

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const calculateBackoff = (attempt: number): number => {
    const delay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt - 1), MAX_DELAY_MS);
    // Add jitter (±20%)
    const jitter = delay * 0.2 * (Math.random() * 2 - 1);
    return Math.floor(delay + jitter);
};

const getAccessToken = async (): Promise<string> => {
    if (!ETA_TOKEN_URL || !ETA_CLIENT_ID || !ETA_CLIENT_SECRET) {
        throw new Error('ETA token configuration missing');
    }
    const res = await fetch(ETA_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: ETA_CLIENT_ID,
            client_secret: ETA_CLIENT_SECRET,
        }),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`ETA token error: ${text}`);
    }
    const data = await res.json();
    return data.access_token;
};

const signPayload = (payload: any) => {
    if (!ETA_PRIVATE_KEY) return undefined;
    try {
        const signer = crypto.createSign('RSA-SHA256');
        signer.update(JSON.stringify(payload));
        signer.end();
        return signer.sign({ key: ETA_PRIVATE_KEY, passphrase: ETA_PRIVATE_KEY_PASSPHRASE }, 'base64');
    } catch (err: any) {
        throw new Error(`ETA signature failed: ${err.message}`);
    }
};

export const etaService = {
    isConfigured(): boolean {
        return !!(ETA_BASE_URL && ETA_API_KEY && ETA_TOKEN_URL && ETA_CLIENT_ID && ETA_CLIENT_SECRET);
    },

    async submitReceipt(payload: any) {
        if (!ETA_BASE_URL) {
            throw new Error('ETA_BASE_URL is not configured');
        }
        if (!ETA_API_KEY) {
            throw new Error('ETA_API_KEY is not configured');
        }
        const token = await getAccessToken();
        const signature = signPayload(payload);
        const requestBody = signature ? { ...payload, signature } : payload;

        const res = await fetch(`${ETA_BASE_URL.replace(/\/$/, '')}/receipts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'x-api-key': ETA_API_KEY,
            },
            body: JSON.stringify(requestBody),
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`ETA submit failed: ${text}`);
        }
        return res.json();
    },

    async submitWithRetry(payload: any, orderId?: string, branchId?: string) {
        let lastError: any;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
            try {
                const result = await this.submitReceipt(payload);

                // Log success
                await db.insert(fiscalLogs).values({
                    orderId,
                    branchId,
                    status: 'SUBMITTED',
                    attempt,
                    payload,
                    response: result,
                });

                return result;
            } catch (err: any) {
                lastError = err;
                log.warn({ attempt, maxRetries: MAX_RETRIES, err: err.message }, 'ETA submission attempt failed');

                if (attempt < MAX_RETRIES) {
                    const delay = calculateBackoff(attempt);
                    console.log(`[ETA] Retrying in ${delay}ms...`);
                    await sleep(delay);
                }
            }
        }

        // All retries exhausted - add to dead-letter queue
        await this.addToDeadLetter(payload, orderId, branchId, lastError?.message || 'Unknown error');

        throw lastError;
    },

    async addToDeadLetter(payload: any, orderId?: string, branchId?: string, errorMessage?: string) {
        log.error({ orderId: orderId || 'unknown', err: errorMessage }, 'ETA moving to dead-letter queue');

        await db.insert(etaDeadLetters).values({
            orderId,
            branchId,
            payload,
            attempts: MAX_RETRIES,
            lastError: errorMessage,
            status: 'PENDING',
        });

        // Also log in fiscal_logs
        await db.insert(fiscalLogs).values({
            orderId,
            branchId,
            status: 'FAILED',
            attempt: MAX_RETRIES,
            lastError: errorMessage,
            payload,
        });
    },

    async retryDeadLetter(deadLetterId: number) {
        const [item] = await db.select().from(etaDeadLetters).where(eq(etaDeadLetters.id, deadLetterId));

        if (!item || item.status !== 'PENDING') {
            throw new Error('Dead letter item not found or already processed');
        }

        // Mark as retrying
        await db.update(etaDeadLetters)
            .set({ status: 'RETRYING', updatedAt: new Date() })
            .where(eq(etaDeadLetters.id, deadLetterId));

        try {
            const result = await this.submitReceipt(item.payload);

            // Mark as resolved
            await db.update(etaDeadLetters)
                .set({ status: 'RESOLVED', resolvedAt: new Date(), updatedAt: new Date() })
                .where(eq(etaDeadLetters.id, deadLetterId));

            return result;
        } catch (err: any) {
            // Increment attempts and put back to pending
            await db.update(etaDeadLetters)
                .set({
                    status: 'PENDING',
                    attempts: (item.attempts || 0) + 1,
                    lastError: err.message,
                    updatedAt: new Date(),
                })
                .where(eq(etaDeadLetters.id, deadLetterId));

            throw err;
        }
    },

    async dismissDeadLetter(deadLetterId: number, userId: string) {
        await db.update(etaDeadLetters)
            .set({
                status: 'DISMISSED',
                dismissedBy: userId,
                dismissedAt: new Date(),
                updatedAt: new Date(),
            })
            .where(eq(etaDeadLetters.id, deadLetterId));
    },

    async getDeadLetters() {
        return db.select().from(etaDeadLetters).where(eq(etaDeadLetters.status, 'PENDING'));
    },
};

