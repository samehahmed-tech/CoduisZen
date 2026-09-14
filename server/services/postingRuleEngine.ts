import { db } from '../db';
import { postingRules, paymentMethodAccounts, taxAccounts, chartOfAccounts } from '../../src/db/schema';
import { and, eq } from 'drizzle-orm';

interface PostingRule {
    id: string;
    documentType: string;
    amountSource: string;
    direction: string;
    accountCode: string;
    conditionField: string | null;
    conditionValue: string | null;
}

export class PostingRuleEngine {
    private static rulesCache: PostingRule[] | null = null;
    private static paymentMapCache: Record<string, string> | null = null;
    private static taxMapCache: Record<string, string> | null = null;

    static async invalidateCache() {
        this.rulesCache = null;
        this.paymentMapCache = null;
        this.taxMapCache = null;
        console.log('[PostingRuleEngine] Cache invalidated.');
    }

    private static async loadCaches() {
        if (!this.rulesCache) {
            this.rulesCache = await db.select().from(postingRules).where(eq(postingRules.isActive, true));
        }
        if (!this.paymentMapCache) {
            const rows = await db.select({
                method: paymentMethodAccounts.paymentMethod,
                code: chartOfAccounts.code
            })
            .from(paymentMethodAccounts)
            .innerJoin(chartOfAccounts, and(eq(paymentMethodAccounts.accountId, chartOfAccounts.id), eq(chartOfAccounts.isActive, true)));
            
            this.paymentMapCache = {};
            for (const r of rows) this.paymentMapCache[r.method] = r.code;
        }
        if (!this.taxMapCache) {
            const rows = await db.select({
                type: taxAccounts.taxType,
                code: chartOfAccounts.code
            })
            .from(taxAccounts)
            .innerJoin(chartOfAccounts, and(eq(taxAccounts.accountId, chartOfAccounts.id), eq(chartOfAccounts.isActive, true)));
            
            this.taxMapCache = {};
            for (const r of rows) this.taxMapCache[r.type] = r.code;
        }
    }

    /**
     * Resolves the configured GL account code based on the rule and current context.
     */
    private static resolveAccountCode(ruleAccountCode: string, context: Record<string, any>): string {
        if (ruleAccountCode === '{PAYMENT_METHOD}') {
            const method = context.paymentMethod || 'CASH';
            return this.paymentMapCache?.[method] || '1110'; // Fallback to Main Cash
        }
        if (ruleAccountCode === '{TAX_OUTPUT}') {
            return this.taxMapCache?.['OUTPUT_VAT'] || '2210';
        }
        if (ruleAccountCode === '{TAX_INPUT}') {
            return this.taxMapCache?.['INPUT_VAT'] || '2220';
        }
        // Direct exact code
        return ruleAccountCode;
    }

    /**
     * Engine Entry Point: Generate Journal Lines for a business event
     */
    static async generateLines(
        documentType: string,
        amounts: Record<string, number>, // e.g., { TOTAL: 100, SUBTOTAL: 85, TAX: 15, SERVICE_CHARGE: 0 }
        context: Record<string, any> // e.g., { paymentMethod: 'CASH', orderType: 'DINE_IN' }
    ) {
        await this.loadCaches();

        const rules = this.rulesCache?.filter(r => r.documentType === documentType) || [];
        const lines: { accountCode: string, debit: number, credit: number }[] = [];

        for (const rule of rules) {
            // Check condition match (e.g. orderType === DINE_IN)
            if (rule.conditionField && rule.conditionValue) {
                const ctxValue = context[rule.conditionField];
                if (String(ctxValue) !== String(rule.conditionValue)) {
                    continue; // Skip rule if it doesn't match context (e.g., DINE_IN rule on a DELIVERY order)
                }
            }

            // Get the amount defined by amountSource (SUBTOTAL, TAX, etc.)
            const amount = amounts[rule.amountSource] || 0;
            if (amount <= 0) continue; // Skip zero-value lines

            const mappedCode = this.resolveAccountCode(rule.accountCode, context);
            
            lines.push({
                accountCode: mappedCode,
                debit: rule.direction === 'DEBIT' ? amount : 0,
                credit: rule.direction === 'CREDIT' ? amount : 0
            });
        }

        return lines;
    }
}
