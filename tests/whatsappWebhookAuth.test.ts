import crypto from 'crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { requireWhatsAppWebhookAuth } from '../server/middleware/whatsappWebhookAuth';

const savedMeta = process.env.WHATSAPP_META_APP_SECRET;
const savedWebhook = process.env.WHATSAPP_WEBHOOK_SECRET;

const invoke = (input: { body: any; rawBody?: Buffer; headers?: Record<string, string> }) => {
    const req: any = { body: input.body, rawBody: input.rawBody, headers: input.headers || {} };
    const res: any = {
        statusCode: 200,
        body: undefined,
        status(code: number) { this.statusCode = code; return this; },
        json(body: unknown) { this.body = body; return this; },
    };
    const next = vi.fn();
    requireWhatsAppWebhookAuth(req, res, next);
    return { res, next };
};

describe('WhatsApp webhook authentication', () => {
    afterEach(() => {
        if (savedMeta === undefined) delete process.env.WHATSAPP_META_APP_SECRET;
        else process.env.WHATSAPP_META_APP_SECRET = savedMeta;
        if (savedWebhook === undefined) delete process.env.WHATSAPP_WEBHOOK_SECRET;
        else process.env.WHATSAPP_WEBHOOK_SECRET = savedWebhook;
    });

    it('rejects unsigned Meta payloads', () => {
        process.env.WHATSAPP_META_APP_SECRET = 'meta-secret-for-tests';
        const rawBody = Buffer.from(JSON.stringify({ object: 'whatsapp_business_account', entry: [] }));
        const result = invoke({ body: JSON.parse(rawBody.toString()), rawBody });
        expect(result.res.statusCode).toBe(401);
        expect(result.next).not.toHaveBeenCalled();
    });

    it('accepts a valid Meta HMAC signature', () => {
        const secret = 'meta-secret-for-tests';
        process.env.WHATSAPP_META_APP_SECRET = secret;
        const rawBody = Buffer.from(JSON.stringify({ object: 'whatsapp_business_account', entry: [] }));
        const signature = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
        const result = invoke({
            body: JSON.parse(rawBody.toString()),
            rawBody,
            headers: { 'x-hub-signature-256': signature },
        });
        expect(result.next).toHaveBeenCalledOnce();
    });

    it('requires the configured shared token for non-Meta webhooks', () => {
        process.env.WHATSAPP_WEBHOOK_SECRET = 'openwa-secret-for-tests';
        expect(invoke({ body: {}, headers: { 'x-webhook-token': 'wrong' } }).res.statusCode).toBe(401);
        expect(invoke({ body: {}, headers: { 'x-webhook-token': 'openwa-secret-for-tests' } }).next).toHaveBeenCalledOnce();
    });
});
