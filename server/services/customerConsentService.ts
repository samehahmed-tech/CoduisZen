import { db } from '../db';
import { sql } from 'drizzle-orm';

let schemaReady: Promise<void> | null = null;

/** Additive migration for channel-specific marketing consent. */
export const ensureCustomerConsentSchema = () => {
    if (!schemaReady) {
        schemaReady = db.execute(sql`
            IF COL_LENGTH('dbo.customers', 'marketing_email_opt_in') IS NULL
                ALTER TABLE dbo.customers ADD marketing_email_opt_in bit NULL CONSTRAINT df_customers_marketing_email_opt_in DEFAULT 1 WITH VALUES;
            IF COL_LENGTH('dbo.customers', 'marketing_sms_opt_in') IS NULL
                ALTER TABLE dbo.customers ADD marketing_sms_opt_in bit NULL CONSTRAINT df_customers_marketing_sms_opt_in DEFAULT 1 WITH VALUES;
            IF COL_LENGTH('dbo.customers', 'marketing_whatsapp_opt_in') IS NULL
                ALTER TABLE dbo.customers ADD marketing_whatsapp_opt_in bit NULL CONSTRAINT df_customers_marketing_whatsapp_opt_in DEFAULT 1 WITH VALUES;
            IF COL_LENGTH('dbo.customers', 'marketing_push_opt_in') IS NULL
                ALTER TABLE dbo.customers ADD marketing_push_opt_in bit NULL CONSTRAINT df_customers_marketing_push_opt_in DEFAULT 1 WITH VALUES;
        `).then(() => undefined).catch((error) => {
            schemaReady = null;
            throw error;
        });
    }
    return schemaReady;
};

export type MarketingConsentChannel = 'GLOBAL' | 'EMAIL' | 'SMS' | 'WHATSAPP' | 'PUSH';

export const CHANNEL_FIELD: Record<Exclude<MarketingConsentChannel, 'GLOBAL'>, 'marketingEmailOptIn' | 'marketingSmsOptIn' | 'marketingWhatsappOptIn' | 'marketingPushOptIn'> = {
    EMAIL: 'marketingEmailOptIn',
    SMS: 'marketingSmsOptIn',
    WHATSAPP: 'marketingWhatsappOptIn',
    PUSH: 'marketingPushOptIn',
};

export const parseMarketingConsentChannel = (value: unknown): MarketingConsentChannel | null => {
    const channel = String(value || 'GLOBAL').trim().toUpperCase();
    return ['GLOBAL', 'EMAIL', 'SMS', 'WHATSAPP', 'PUSH'].includes(channel)
        ? channel as MarketingConsentChannel
        : null;
};
