/**
 * Gift Card Service — P1 Financial Backbone (Toast-style gift cards)
 *
 * Lifecycle: ISSUE → optional TOPUP → REDEMPTION (partial allowed) →
 * EXPIRE / VOID. Every mutation appends a gift_card_transaction and keeps
 * gift_cards.balance as the source of truth.
 *
 * Accounting: issuing converts cash → liability (gift cards outstanding),
 * redemption converts liability → revenue. Card mutation and GL posting are
 * one fail-closed transaction: an unmapped account never leaves a balance
 * change without its corresponding journal entry.
 */

import { db } from '../db';
import { giftCards, giftCardTransactions } from '../../src/db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';

const genCode = () => `XN-${nanoid(10).toUpperCase()}`;

const postLedger = async (tx: any, reference: string, referenceType: string, description: string, branchId: string | null, lines: { accountCode: string; debit: number; credit: number; description: string }[], createdBy?: string) => {
    const glMod = await import('./glService');
    const result = await glMod.GLService.postJournalEntry({
        reference,
        referenceType: referenceType as never,
        description,
        branchId: branchId || undefined,
        lines: lines as never[],
        createdBy,
        actorId: createdBy || 'system',
        source: `GIFT_CARD_${referenceType}`,
        correlationId: `GIFT_CARD:${reference}`,
    }, tx);
    if (!result || typeof result !== 'object' || !('entryId' in result) || !result.entryId) {
        throw Object.assign(new Error('GIFT_CARD_GL_POSTING_FAILED'), {
            code: 'GIFT_CARD_GL_POSTING_FAILED',
            status: 503,
        });
    }
    return result;
};

const lockCard = async (tx: any, cardId: string) => {
    await tx.execute(sql`SELECT ${giftCards.id} FROM ${giftCards} WITH (UPDLOCK, HOLDLOCK) WHERE ${giftCards.id} = ${cardId}`);
    const [card] = await tx.select().from(giftCards).where(eq(giftCards.id, cardId));
    return card;
};

export const giftCardService = {
    issue: async (input: { amount: number; branchId?: string; customerId?: string; purchasedOrderId?: string; createdBy: string; expiresAt?: Date }) => {
        const amount = Number(input.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
            throw Object.assign(new Error('INVALID_GIFT_CARD_AMOUNT'), { status: 400, code: 'INVALID_GIFT_CARD_AMOUNT' });
        }

        const id = `gc-${nanoid(8)}`;
        const code = genCode();
        const card = await db.transaction(async (tx) => {
            await tx.insert(giftCards).values({
                id,
                code,
                branchId: input.branchId || null,
                customerId: input.customerId || null,
                initialAmount: String(amount),
                balance: String(amount),
                status: 'ACTIVE',
                expiresAt: input.expiresAt || null,
                issuedBy: input.createdBy,
                purchasedOrderId: input.purchasedOrderId || null,
            });

            await postLedger(tx, `GC-${id}`, 'GIFT_CARD_ISSUE', `Gift card issued ${code} ${amount} EGP`, input.branchId || null, [
                    { accountCode: '1110', debit: amount, credit: 0, description: 'Cash received for gift card' },
                    { accountCode: '2300', debit: 0, credit: amount, description: 'Gift card liability created' },
                ], input.createdBy);
            const [created] = await tx.select().from(giftCards).where(eq(giftCards.id, id));
            return created;
        });
        return card;
    },

    topup: async (cardId: string, amount: number, createdBy: string) => {
        const updated = await db.transaction(async (tx) => {
        const card = await lockCard(tx, cardId);
        if (!card) throw Object.assign(new Error('GIFT_CARD_NOT_FOUND'), { status: 404, code: 'GIFT_CARD_NOT_FOUND' });
        if (card.status !== 'ACTIVE') throw Object.assign(new Error('GIFT_CARD_NOT_ACTIVE'), { status: 400, code: 'GIFT_CARD_NOT_ACTIVE' });
        const top = Number(amount);
        if (!Number.isFinite(top) || top <= 0) throw Object.assign(new Error('INVALID_TOPUP_AMOUNT'), { status: 400, code: 'INVALID_TOPUP_AMOUNT' });

        const newBalance = Math.round((Number(card.balance) + top) * 100) / 100;
        const transactionId = `gct-${nanoid(8)}`;
        await tx.insert(giftCardTransactions).values({
            id: transactionId,
            giftCardId: cardId,
            type: 'TOPUP',
            amount: String(top),
            balanceAfter: String(newBalance),
            createdBy,
        });
        await tx.update(giftCards).set({ balance: String(newBalance), updatedAt: new Date() }).where(eq(giftCards.id, cardId));
        await postLedger(tx, `GCTOP-${transactionId}`, 'GIFT_CARD_TOPUP', `Gift card topup ${top} EGP`, card.branchId, [
            { accountCode: '1110', debit: top, credit: 0, description: 'Cash topup received' },
            { accountCode: '2300', debit: 0, credit: top, description: 'Gift card liability increased' },
        ], createdBy);
        const [result] = await tx.select().from(giftCards).where(eq(giftCards.id, cardId));
        return result;
        });
        return updated;
    },

    redeem: async (input: { cardId: string; amount: number; orderId?: string; createdBy: string }) => {
        const updated = await db.transaction(async (tx) => {
        const card = await lockCard(tx, input.cardId);
        if (!card) throw Object.assign(new Error('GIFT_CARD_NOT_FOUND'), { status: 404, code: 'GIFT_CARD_NOT_FOUND' });
        if (card.status !== 'ACTIVE') throw Object.assign(new Error('GIFT_CARD_NOT_ACTIVE'), { status: 400, code: 'GIFT_CARD_NOT_ACTIVE' });
        const use = Number(input.amount);
        if (!Number.isFinite(use) || use <= 0) throw Object.assign(new Error('INVALID_REDEMPTION_AMOUNT'), { status: 400, code: 'INVALID_REDEMPTION_AMOUNT' });
        if (use > Number(card.balance)) {
            throw Object.assign(new Error('INSUFFICIENT_GIFT_CARD_BALANCE'), {
                status: 400, code: 'INSUFFICIENT_GIFT_CARD_BALANCE',
                balance: card.balance, requested: use,
            });
        }

        const newBalance = Math.round((Number(card.balance) - use) * 100) / 100;
        const transactionId = `gct-${nanoid(8)}`;
        await tx.insert(giftCardTransactions).values({
            id: transactionId,
            giftCardId: input.cardId,
            type: 'REDEMPTION',
            amount: String(use),
            balanceAfter: String(newBalance),
            orderId: input.orderId || null,
            createdBy: input.createdBy,
        });
        const newStatus = newBalance <= 0 ? 'USED' : 'ACTIVE';
        await tx.update(giftCards).set({
            balance: String(newBalance),
            status: newStatus,
            updatedAt: new Date(),
        }).where(eq(giftCards.id, input.cardId));

        await postLedger(tx, `GCREDEEM-${transactionId}`, 'GIFT_CARD_REDEMPTION', `Gift card redemption ${use} EGP`, card.branchId, [
            { accountCode: '2300', debit: use, credit: 0, description: 'Gift card liability reduced' },
            { accountCode: '4100', debit: 0, credit: use, description: 'Revenue recognized on redemption' },
        ], input.createdBy);

        const [result] = await tx.select().from(giftCards).where(eq(giftCards.id, input.cardId));
        return result;
        });
        return updated;
    },

    void: async (cardId: string, voidedBy: string) => {
        const updated = await db.transaction(async (tx) => {
        const card = await lockCard(tx, cardId);
        if (!card) throw Object.assign(new Error('GIFT_CARD_NOT_FOUND'), { status: 404, code: 'GIFT_CARD_NOT_FOUND' });
        if (card.status === 'VOIDED') throw Object.assign(new Error('GIFT_CARD_ALREADY_VOIDED'), { status: 400, code: 'GIFT_CARD_ALREADY_VOIDED' });

        const refunded = Number(card.balance);
        const transactionId = `gct-${nanoid(8)}`;
        await tx.insert(giftCardTransactions).values({
            id: transactionId,
            giftCardId: cardId,
            type: 'VOID',
            amount: String(-refunded),
            balanceAfter: '0',
            createdBy: voidedBy,
        });
        await tx.update(giftCards).set({ status: 'VOIDED', balance: '0', updatedAt: new Date() }).where(eq(giftCards.id, cardId));
        if (refunded > 0) {
            await postLedger(tx, `GCVOID-${transactionId}`, 'GIFT_CARD_VOID', `Gift card voided refund ${refunded} EGP`, card.branchId, [
                { accountCode: '2300', debit: refunded, credit: 0, description: 'Liability released on void' },
                { accountCode: '1110', debit: 0, credit: refunded, description: 'Cash refunded' },
            ], voidedBy);
        }
        const [result] = await tx.select().from(giftCards).where(eq(giftCards.id, cardId));
        return result;
        });
        return updated;
    },

    getCard: async (cardIdOrCode: string) => {
        let rows = await db.select().from(giftCards).where(eq(giftCards.id, cardIdOrCode));
        if (rows.length === 0) {
            rows = await db.select().from(giftCards).where(eq(giftCards.code, cardIdOrCode));
        }
        if (rows.length === 0) return null;
        const card = rows[0];
        const transactions = await db.select().from(giftCardTransactions)
            .where(eq(giftCardTransactions.giftCardId, card.id)).orderBy(desc(giftCardTransactions.createdAt));
        return { card, transactions };
    },

    listByBranch: async (branchId: string) => {
        return db.select().from(giftCards)
            .where(eq(giftCards.branchId, branchId))
            .orderBy(desc(giftCards.createdAt));
    },

    listByCustomer: async (customerId: string) => {
        return db.select().from(giftCards).where(eq(giftCards.customerId, customerId));
    },
};

export default giftCardService;
