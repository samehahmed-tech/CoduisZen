import { Request, Response } from 'express';
import { db } from '../db';
import { postingRules, paymentMethodAccounts, taxAccounts, chartOfAccounts } from '../../src/db/schema';
import { and, eq } from 'drizzle-orm';
import { PostingRuleEngine } from '../services/postingRuleEngine';
import { getNumberParam, getStringParam } from '../utils/request';
import { nanoid } from 'nanoid';

export const getPostingRules = async (_req: Request, res: Response) => {
    try {
        const rules = await db.select().from(postingRules).orderBy(postingRules.documentType, postingRules.amountSource);
        res.json(rules);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const createPostingRule = async (req: Request, res: Response) => {
    try {
        const body = req.body || {};
        const documentType = String(body.documentType || '').trim().toUpperCase();
        const amountSource = String(body.amountSource || '').trim().toUpperCase();
        const direction = String(body.direction || '').trim().toUpperCase();
        const accountCode = String(body.accountCode || '').trim();
        if (!documentType || !amountSource || !['DEBIT', 'CREDIT'].includes(direction) || !accountCode) {
            return res.status(400).json({ error: 'POSTING_RULE_FIELDS_REQUIRED' });
        }
        if (!/^[A-Z][A-Z0-9_]{1,80}$/.test(documentType) || !/^[A-Z][A-Z0-9_]{1,80}$/.test(amountSource)) {
            return res.status(400).json({ error: 'POSTING_RULE_FIELD_INVALID' });
        }
        if (!['{PAYMENT_METHOD}', '{TAX_OUTPUT}', '{TAX_INPUT}'].includes(accountCode)) {
            const [account] = await db.select({ id: chartOfAccounts.id })
                .from(chartOfAccounts)
                .where(and(eq(chartOfAccounts.code, accountCode), eq(chartOfAccounts.isActive, true)))
                .top(1);
            if (!account) return res.status(400).json({ error: 'ACTIVE_ACCOUNT_REQUIRED_FOR_POSTING_RULE' });
        }
        const id = `PR_CUSTOM_${nanoid(12)}`;
        const [created] = await db.insert(postingRules).output().values({
            id,
            documentType,
            amountSource,
            direction,
            accountCode,
            conditionField: body.conditionField ? String(body.conditionField).trim() : null,
            conditionValue: body.conditionValue ? String(body.conditionValue).trim() : null,
            isActive: body.isActive !== false,
            isSystem: false,
            version: 1,
            updatedAt: new Date(),
        });
        await PostingRuleEngine.invalidateCache();
        res.status(201).json(created);
    } catch (error: any) {
        res.status(400).json({ error: error.message || 'POSTING_RULE_CREATE_FAILED' });
    }
};

export const updatePostingRule = async (req: Request, res: Response) => {
    try {
        const id = getStringParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'POSTING_RULE_ID_REQUIRED' });
        const body = req.body;
        const accountCode = String(body.accountCode || '').trim();
        if (!accountCode) return res.status(400).json({ error: 'POSTING_RULE_ACCOUNT_REQUIRED' });
        if (!['{PAYMENT_METHOD}', '{TAX_OUTPUT}', '{TAX_INPUT}'].includes(accountCode)) {
            const [account] = await db.select({ id: chartOfAccounts.id })
                .from(chartOfAccounts)
                .where(and(eq(chartOfAccounts.code, accountCode), eq(chartOfAccounts.isActive, true)))
                .top(1);
            if (!account) return res.status(400).json({ error: 'ACTIVE_ACCOUNT_REQUIRED_FOR_POSTING_RULE' });
        }
        
        await db.update(postingRules)
            .set({ 
                accountCode,
                isActive: body.isActive === undefined ? undefined : Boolean(body.isActive),
                updatedAt: new Date()
            })
            .where(eq(postingRules.id, id));
            
        await PostingRuleEngine.invalidateCache();
        res.json({ success: true });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const deletePostingRule = async (req: Request, res: Response) => {
    try {
        const id = getStringParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'POSTING_RULE_ID_REQUIRED' });
        const [rule] = await db.select().from(postingRules).where(eq(postingRules.id, id)).top(1);
        if (!rule) return res.status(404).json({ error: 'POSTING_RULE_NOT_FOUND' });
        if (rule.isSystem) return res.status(409).json({ error: 'SYSTEM_POSTING_RULE_CANNOT_BE_DELETED' });
        await db.delete(postingRules).where(eq(postingRules.id, id));
        await PostingRuleEngine.invalidateCache();
        res.json({ success: true });
    } catch (error: any) {
        res.status(400).json({ error: error.message || 'POSTING_RULE_DELETE_FAILED' });
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
        const [account] = await db.select({ id: chartOfAccounts.id })
            .from(chartOfAccounts)
            .where(and(eq(chartOfAccounts.id, String(accountId || '')), eq(chartOfAccounts.isActive, true)))
            .top(1);
        if (!account) return res.status(400).json({ error: 'ACTIVE_ACCOUNT_REQUIRED_FOR_PAYMENT_MAPPING' });
        
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
        const [account] = await db.select({ id: chartOfAccounts.id })
            .from(chartOfAccounts)
            .where(and(eq(chartOfAccounts.id, String(accountId || '')), eq(chartOfAccounts.isActive, true)))
            .top(1);
        if (!account) return res.status(400).json({ error: 'ACTIVE_ACCOUNT_REQUIRED_FOR_TAX_MAPPING' });
        
        await db.update(taxAccounts)
            .set({ accountId, rate: rate !== undefined ? Number(rate) : undefined })
            .where(eq(taxAccounts.id, id));
            
        await PostingRuleEngine.invalidateCache();
        res.json({ success: true });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};
