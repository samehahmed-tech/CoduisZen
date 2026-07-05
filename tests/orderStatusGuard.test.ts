import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const orderStore = readFileSync(resolve(process.cwd(), 'stores/useOrderStore.ts'), 'utf8');
const ordersCenter = readFileSync(resolve(process.cwd(), 'components/OrdersCenter.tsx'), 'utf8');
const whatsappRoutes = readFileSync(resolve(process.cwd(), 'server/routes/whatsappRoutes.ts'), 'utf8');

describe('order status UI guardrails', () => {
    it('throws status update failures so the order page cannot show fake success', () => {
        const start = orderStore.indexOf('updateOrderStatus: async');
        expect(start).toBeGreaterThan(-1);

        const end = orderStore.indexOf('\n\n\n            setOrderMode', start);
        const body = orderStore.slice(start, end > start ? end : undefined);

        expect(body).toContain("set({ error: 'ORDER_VERSION_CONFLICT' });");
        expect(body).toContain("set({ error: error?.code || error?.message || 'ORDER_STATUS_UPDATE_FAILED' });");
        expect(body.match(/throw error;/g)?.length).toBeGreaterThanOrEqual(2);
    });

    it('uses a production WhatsApp send route for customer order messages', () => {
        expect(ordersCenter).toContain("apiRequest('/whatsapp/send-message'");
        expect(ordersCenter).not.toContain("apiRequest('/whatsapp/send-test'");
        expect(ordersCenter).not.toContain('Payment link sent');
        expect(ordersCenter).toContain('Payment request sent');
        expect(whatsappRoutes).toContain("router.post('/send-message'");
    });
});
