import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { orderItems, orders, settings } from '../../src/db/schema';
import { sendWhatsAppText } from './whatsappService';

const WHATSAPP_AUTOMATION_CONFIG_KEY = 'whatsapp_automation_config_v1';

type WhatsAppAutomationConfig = {
    orderCreated?: boolean;
    outForDelivery?: boolean;
    delivered?: boolean;
    feedback?: boolean;
    botEnabled?: boolean;
    feedbackDelayMinutes?: number;
};

const enabled = () => String(process.env.WHATSAPP_AUTOMATION_ENABLED || 'true').toLowerCase() !== 'false';
const feedbackDelayMs = (config?: WhatsAppAutomationConfig) => {
    const configuredMinutes = Number(config?.feedbackDelayMinutes || 0);
    if (configuredMinutes > 0) return Math.max(60_000, configuredMinutes * 60 * 1000);
    return Math.max(60_000, Number(process.env.WHATSAPP_FEEDBACK_DELAY_MS || 60 * 60 * 1000));
};

const isDeliveryLike = (order: any) =>
    ['DELIVERY', 'PICKUP', 'TAKEAWAY'].includes(String(order?.type || '').toUpperCase());

const money = (value: unknown) => `${Number(value || 0).toFixed(2)} ج.م`;

const clean = (value: unknown) => String(value || '').trim();

const loadAutomationConfig = async (): Promise<WhatsAppAutomationConfig> => {
    try {
        const [row] = await db.select().from(settings).where(eq(settings.key, WHATSAPP_AUTOMATION_CONFIG_KEY)).limit(1);
        return (row?.value && typeof row.value === 'object' ? row.value : {}) as WhatsAppAutomationConfig;
    } catch {
        return {};
    }
};

const formatOrderItems = async (orderId: string) => {
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    return items
        .map((item) => `- ${Number(item.quantity || 1)} × ${clean(item.name)} (${money(Number(item.price || 0) * Number(item.quantity || 1))})`)
        .join('\n');
};

const sendOrderMessage = async (order: any, text: string, role: string) => {
    if (!enabled() || !order?.customerPhone) return;
    await sendWhatsAppText({
        to: order.customerPhone,
        text,
        branchId: order.branchId,
        orderId: order.id,
        sessionRole: role,
    });
};

export const whatsappAutomationService = {
    async onOrderCreated(order: any) {
        if (!enabled() || !isDeliveryLike(order) || !order?.customerPhone) return;
        try {
            const config = await loadAutomationConfig();
            if (config.orderCreated === false) return;
            const itemsText = await formatOrderItems(order.id);
            const name = clean(order.customerName) || 'عميلنا العزيز';
            const address = clean(order.deliveryAddress);
            const source = clean(order.source);
            const message = [
                `أهلا ${name} 👋`,
                `تم استلام طلبك رقم #${order.orderNumber || order.id}.`,
                source ? `مصدر الطلب: ${source}` : '',
                '',
                itemsText,
                '',
                `الإجمالي: ${money(order.total)}`,
                address ? `العنوان: ${address}` : '',
                '',
                'هنبلغك أول ما الطلب يخرج في الطريق. شكرا لاختيارك لنا.',
            ].filter(Boolean).join('\n');
            await sendOrderMessage(order, message, 'ORDERS');
        } catch (error) {
            console.warn('WhatsApp order-created automation failed:', error);
        }
    },

    async onOrderStatusChanged(order: any, status: string) {
        if (!enabled() || !isDeliveryLike(order) || !order?.customerPhone) return;
        const normalized = String(status || '').toUpperCase();
        const config = await loadAutomationConfig();
        if (normalized === 'OUT_FOR_DELIVERY' && config.outForDelivery === false) return;
        if ((normalized === 'DELIVERED' || normalized === 'COMPLETED') && config.delivered === false) return;
        let message = '';
        if (normalized === 'OUT_FOR_DELIVERY') {
            message = `طلبك #${order.orderNumber || order.id} خرج في الطريق إليك 🚚\nشكرا لانتظارك.`;
        } else if (normalized === 'DELIVERED' || normalized === 'COMPLETED') {
            message = `تم تسليم طلبك #${order.orderNumber || order.id} ✅\nنتمنى تكون التجربة عجبتك وبالهنا والشفا.`;
        } else if (normalized === 'CANCELLED') {
            message = `تم إلغاء طلبك #${order.orderNumber || order.id}.\nنعتذر عن أي إزعاج.`;
        }
        if (!message) return;
        try {
            await sendOrderMessage(order, message, 'ORDERS');
            if (normalized === 'DELIVERED' || normalized === 'COMPLETED') {
                if (config.feedback !== false) this.scheduleFeedback(order, config);
            }
        } catch (error) {
            console.warn('WhatsApp status automation failed:', error);
        }
    },

    scheduleFeedback(order: any, config?: WhatsAppAutomationConfig) {
        if (!enabled() || !order?.customerPhone) return;
        const delay = feedbackDelayMs(config);
        setTimeout(() => {
            const message = [
                `رأيك يهمنا في طلب #${order.orderNumber || order.id}.`,
                'لو التجربة كانت جيدة ابعت 5، ولو في أي مشكلة اكتب لنا وهنراجعها فورا.',
            ].join('\n');
            sendOrderMessage(order, message, 'FEEDBACK').catch((error) => {
                console.warn('WhatsApp feedback automation failed:', error);
            });
        }, delay);
    },

    async onInboundMessage(message: { from: string; text: string }) {
        if (!enabled()) return;
        const config = await loadAutomationConfig();
        if (config.botEnabled === false) return;
        const from = clean(message.from);
        const text = clean(message.text);
        const lower = text.toLowerCase();
        if (!from || !text) return;

        if (['menu', 'منيو', 'المنيو', 'مينيو'].some((word) => lower.includes(word))) {
            await sendWhatsAppText({
                to: from,
                text: 'أهلا بيك 👋\nاكتب طلبك أو ابعت اسم الصنف، وفريقنا هيتابع معاك. ولو محتاج تعرف حالة طلبك اكتب: حالة الطلب.',
                sessionRole: 'SUPPORT',
            });
            return;
        }

        if (lower.includes('حالة') || lower.includes('طلب') || lower.includes('status')) {
            const phone = from.replace(/[^\d]/g, '');
            const phoneCandidates = Array.from(new Set([
                phone,
                phone.startsWith('2') ? phone.slice(1) : `2${phone}`,
            ].filter(Boolean)));
            const [latestOrder] = await db
                .select()
                .from(orders)
                .where(inArray(orders.customerPhone, phoneCandidates))
                .orderBy(desc(orders.createdAt))
                .limit(1);
            if (latestOrder) {
                await sendWhatsAppText({
                    to: from,
                    text: `آخر طلب لك رقم #${latestOrder.orderNumber || latestOrder.id}\nالحالة الحالية: ${latestOrder.status}\nالإجمالي: ${money(latestOrder.total)}`,
                    branchId: latestOrder.branchId,
                    orderId: latestOrder.id,
                    sessionRole: 'SUPPORT',
                });
            } else {
                await sendWhatsAppText({
                    to: from,
                    text: 'مش لاقيين طلب مرتبط بالرقم ده حاليا. ابعت رقم الطلب أو كلم خدمة العملاء.',
                    sessionRole: 'SUPPORT',
                });
            }
            return;
        }

        if (/^[1-5]$/.test(text)) {
            const rating = Number(text);
            const reply = rating >= 4
                ? 'شكرا جدا لتقييمك 🙏 سعداء إن التجربة عجبتك.'
                : 'شكرا لتقييمك. نعتذر لو التجربة ماكنتش مثالية، فريقنا هيراجع ملاحظتك ويتواصل معاك لو محتاجين تفاصيل.';
            await sendWhatsAppText({ to: from, text: reply, sessionRole: 'FEEDBACK' });
        }
    },
};
