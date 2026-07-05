import { Request, Response } from 'express';
import { db } from '../db';
import { postingRules, paymentMethodAccounts, taxAccounts, chartOfAccounts } from '../../src/db/schema';
import { eq } from 'drizzle-orm';
import { PostingRuleEngine } from '../services/postingRuleEngine';
import { getNumberParam, getStringParam } from '../utils/request';

export const getPostingRules = async (_req: Request, res: Response) => {
    try {
        const rules = await db.select().from(postingRules).orderBy(postingRules.documentType, postingRules.amountSource);
        res.json(rules);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const updatePostingRule = async (req: Request, res: Response) => {
    try {
        const id = getStringParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'POSTING_RULE_ID_REQUIRED' });
        const body = req.body;
        
        await db.update(postingRules)
            .set({ 
                accountCode: body.accountCode,
                isActive: body.isActive,
                updatedAt: new Date()
            })
            .where(eq(postingRules.id, id));
            
        await PostingRuleEngine.invalidateCache();
        res.json({ success: true });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getPaymentMappings = async (_req: Request, res: Response) => {
    try {
        const rows = await db.select({
            id: paymentMethodAccounts.id,
            paymentMethod: paymentMethodAccounts.paymentMethod,
            accountId: paymentMethodAccounts.accountId,
            accountCode: chartOfAccounts.code,
            accountName: chartOfAccounts.name
        })
        .from(paymentMethodAccounts)
        .leftJoin(chartOfAccounts, eq(paymentMethodAccounts.accountId, chartOfAccounts.id));
        
        res.json(rows);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const updatePaymentMapping = async (req: Request, res: Response) => {
    try {
        const id = getNumberParam(req.params.id);
        if (id === undefined) return res.status(400).json({ error: 'PAYMENT_MAPPING_ID_REQUIRED' });
        const { accountId } = req.body;
        
        await db.update(paymentMethodAccounts)
            .set({ accountId })
            .where(eq(paymentMethodAccounts.id, id));
            
        await PostingRuleEngine.invalidateCache();
        res.json({ success: true });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getTaxMappings = async (_req: Request, res: Response) => {
    try {
        const rows = await db.select({
            id: taxAccounts.id,
            taxType: taxAccounts.taxType,
            rate: taxAccounts.rate,
            accountId: taxAccounts.accountId,
            accountCode: chartOfAccounts.code,
            accountName: chartOfAccounts.name
        })
        .from(taxAccounts)
        .leftJoin(chartOfAccounts, eq(taxAccounts.accountId, chartOfAccounts.id));
        
        res.json(rows);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const updateTaxMapping = async (req: Request, res: Response) => {
    try {
        const id = getNumberParam(req.params.id);
        if (id === undefined) return res.status(400).json({ error: 'TAX_MAPPING_ID_REQUIRED' });
        const { accountId, rate } = req.body;
        
        await db.update(taxAccounts)
            .set({ accountId, rate: rate !== undefined ? Number(rate) : undefined })
            .where(eq(taxAccounts.id, id));
            
        await PostingRuleEngine.invalidateCache();
        res.json({ success: true });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};
