import type { TalabatWebhookPayload } from './talabatTypes';
import { getCustomer, getExternalConfigId, getStoreId, getTotals, mapTalabatOrderType } from './talabatMapper';
import type { TalabatConfig } from './talabatConfig';

/** Pure: store -> branch. external_partner_config_id wins over store_id. */
export const resolveTalabatBranch = (
    payload: Pick<TalabatWebhookPayload, 'store_id' | 'external_partner_config_id' | 'client'>,
    config: Pick<TalabatConfig, 'storeBranchMap' | 'defaultBranchId'>,
): string | null => {
    const map = config?.storeBranchMap || {};
    const ext = getExternalConfigId(payload as TalabatWebhookPayload);
    if (ext && map[ext]) return map[ext];
    const store = getStoreId(payload as TalabatWebhookPayload);
    if (store && map[store]) return map[store];
    return String(config?.defaultBranchId || '').trim() || null;
};

/** Pure: build the orders-row fields from a validated payload. */
export const buildTalabatOrderRow = (payload: TalabatWebhookPayload, branchId: string): Record<string, any> => {
    const orderId = String((payload as any).order_id).trim();
    const { subTotal, orderTotal, deliveryFee } = getTotals(payload);
    const customer = getCustomer(payload);
    const externalRef = String((payload as any).external_order_id || '').trim();
    const orderCode = String((payload as any).order_code || '').trim();
    const refLine = [externalRef ? `Ext:${externalRef}` : '', orderCode ? `Code:${orderCode}` : ''].filter(Boolean).join(' ');
    const comment = String((payload as any).comment || '').trim();
    return {
        type: mapTalabatOrderType((payload as any).order_type),
        source: 'talabat',
        deliverySource: 'talabat',
        branchId,
        platformOrderId: orderId,
        customerName: customer.name,
        customerPhone: customer.phone,
        deliveryAddress: customer.address,
        deliveryLat: customer.lat,
        deliveryLng: customer.lng,
        deliveryNotes: customer.notes,
        subtotal: subTotal,
        total: orderTotal,
        deliveryFee,
        tax: 0,
        isPaid: false,
        paymentMethod: 'TALABAT',
        notes: [refLine ? `Talabat ${refLine}` : 'Talabat order', comment ? `Note:${comment}` : ''].filter(Boolean).join(' '),
        kitchenNotes: undefined,
        isPreorder: Boolean((payload as any).isPreorder),
        promisedFor: (payload as any).promised_for || undefined,
    };
};
