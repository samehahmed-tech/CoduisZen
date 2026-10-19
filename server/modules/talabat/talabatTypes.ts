/**
 * Talabat Partner API v2 contract (developer.talabat.com).
 * Types mirror the webhook payload literally — no business logic here.
 */

export type TalabatWebhookStatus =
    | 'RECEIVED'
    | 'READY_FOR_PICKUP'
    | 'DISPATCHED'
    | 'CANCELLED'
    | 'UPDATE_CART';

export type TalabatOrderType = 'DELIVERY' | 'PICKUP';
export type TalabatTransportType = 'VENDOR_DELIVERY' | 'LOGISTICS_DELIVERY';
export type TalabatPricingType = 'UNIT' | 'KG';
export type TalabatItemStatus = 'IN_CART' | 'NOT_FOUND' | 'REPLACED' | 'ADDITION';

export interface TalabatItemPricing {
    pricing_type: TalabatPricingType;
    quantity?: number;
    min_quantity?: number;
    max_quantity?: number;
    unit_price?: number;
    total_price?: number;
    weight?: number;
}

export interface TalabatOrderItem {
    id?: string;
    sku: string;
    name?: string;
    pricing: TalabatItemPricing;
    status: TalabatItemStatus;
    replaced_id?: string;
    notes?: string;
}

export interface TalabatCancellation {
    reason?: string;
    source?: string;
    post_pickup_flag?: boolean;
}

export interface TalabatWebhookPayload {
    order_id: string;
    order_code?: string;
    external_order_id?: string;
    // Flat (legacy/test) shape — real webhooks nest these under client/payment.
    store_id?: string;
    external_partner_config_id?: string;
    order_type?: TalabatOrderType;
    transport_type?: TalabatTransportType;
    status: TalabatWebhookStatus;
    items?: TalabatOrderItem[];
    sub_total?: number;
    order_total?: number;
    delivery_fee?: number;
    customer?: TalabatCustomer;
    cancellation?: TalabatCancellation | null;
    // Real spec shape
    client?: {
        id?: string;
        chain_id?: string;
        country_code?: string;
        name?: string;
        store_id?: string;
        external_partner_config_id?: string;
    };
    payment?: {
        sub_total?: number;
        order_total?: number;
        delivery_fee?: number;
        total_taxes?: number;
        discount?: number;
        type?: string;
    };
    comment?: string;
    isPreorder?: boolean;
    accepted_for?: string;
    promised_for?: string;
    promotion_status?: 'AVAILABLE' | 'UNAVAILABLE';
}

export interface TalabatCustomer {
    first_name?: string;
    last_name?: string;
    name?: string;
    phone_number?: string;
    phone?: string;
    address?: string;
    lat?: number;
    lng?: number;
    notes?: string;
    delivery_address?: {
        formattedAddress?: string;
        instructions?: string;
        latitude?: number;
        longitude?: number;
        city?: string;
        street?: string;
        building?: string;
        apartment?: string;
        floor?: string;
    };
}

export type InternalOrderStatus = 'PENDING' | 'PREPARING' | 'READY' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED';
export type InternalOrderType = 'DELIVERY' | 'TAKEAWAY';

export interface NormalizedTalabatItem {
    sku: string;
    quantity: number;
    weight?: number;
    unitPrice?: number;
    totalPrice?: number;
    pricingType: TalabatPricingType;
    status: TalabatItemStatus;
    replacedId?: string;
}
