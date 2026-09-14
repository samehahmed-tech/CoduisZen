/**
 * P1 Financial Backbone Controller
 * Handlers for drawers, bank accounts, transfers, invoice matching, tip pools,
 * gift cards, payment gateways, and daily P&L snapshots.
 */

import { Request, Response } from 'express';
import { drawerService } from '../services/drawerReconciliationService';
import { bankingService } from '../services/bankingService';
import { matchingService } from '../services/supplierInvoiceMatchingService';
import { tipPoolService } from '../services/tipPoolService';
import { giftCardService } from '../services/giftCardService';
import { paymentGatewayService } from '../services/paymentGatewayService';
import { dailyPnlService } from '../services/dailyPnlService';
import { getStringParam } from '../utils/request';

const getBranchId = (req: Request): string | undefined =>
    getStringParam(req.query.branchId) || req.effectiveBranchId || (req.user as any)?.branchId;

const handle = (fn: (req: Request, res: Response) => Promise<any>) => async (req: Request, res: Response) => {
    try {
        await fn(req, res);
    } catch (error: any) {
        const status = Number(error?.status) || 500;
        res.status(status).json({
            error: error?.code || error?.message,
            message: error?.message,
            ...(error?.unpaidCount !== undefined ? { unpaidCount: error.unpaidCount } : {}),
            ...(error?.available !== undefined ? { available: error.available, requested: error.requested } : {}),
            ...(error?.balance !== undefined ? { balance: error.balance } : {}),
        });
    }
};

// ---------------------------------------------------------------------------
// Cash Drawers
// ---------------------------------------------------------------------------
export const openDrawer = handle(async (req, res) => {
    const branchId = getBranchId(req);
    if (!branchId) return res.status(400).json({ error: 'BRANCH_ID_REQUIRED' });
    const openingCash = Number(req.body?.openingCash || 0);
    const openedBy = req.user?.id || req.body?.openedBy;
    if (!openedBy) return res.status(400).json({ error: 'USER_ID_REQUIRED' });
    const result = await drawerService.openDrawer({ branchId, openingCash, openedBy });
    res.json(result);
});

export const getActiveDrawer = handle(async (req, res) => {
    const branchId = getBranchId(req);
    if (!branchId) return res.status(400).json({ error: 'BRANCH_ID_REQUIRED' });
    const drawer = await drawerService.getOpenDrawer(branchId);
    res.json(drawer);
});

export const recordDrawerCount = handle(async (req, res) => {
    const drawerId = getStringParam((req.params as any).id);
    if (!drawerId) return res.status(400).json({ error: 'DRAWER_ID_REQUIRED' });
    const countedBy = req.user?.id;
    const lines = Array.isArray(req.body?.lines) ? req.body.lines : [];
    const result = await drawerService.recordCount(drawerId, countedBy, lines);
    res.json(result);
});

export const getDrawerCount = handle(async (req, res) => {
    const drawerId = getStringParam((req.params as any).id);
    if (!drawerId) return res.status(400).json({ error: 'DRAWER_ID_REQUIRED' });
    const result = await drawerService.getDrawerCount(drawerId);
    res.json(result);
});

export const closeDrawer = handle(async (req, res) => {
    const drawerId = getStringParam((req.params as any).id);
    if (!drawerId) return res.status(400).json({ error: 'DRAWER_ID_REQUIRED' });
    const closedBy = req.user?.id;
    const cashierId = req.body?.cashierId || req.user?.id;
    const shiftId = getStringParam(req.body?.shiftId);
    if (!shiftId) return res.status(400).json({ error: 'SHIFT_ID_REQUIRED' });
    const result = await drawerService.closeDrawer({
        drawerId,
        closedBy,
        cashierId,
        shiftId,
        countedCash: req.body?.countedCash,
        notes: req.body?.notes,
    });
    res.json(result);
});

export const listDrawers = handle(async (req, res) => {
    const branchId = getBranchId(req);
    if (!branchId) return res.status(400).json({ error: 'BRANCH_ID_REQUIRED' });
    const drawers = await drawerService.listDrawers(branchId);
    res.json(drawers);
});

// ---------------------------------------------------------------------------
// Drawer Discrepancies
// ---------------------------------------------------------------------------
export const listDiscrepancies = handle(async (req, res) => {
    const branchId = getBranchId(req);
    if (!branchId) return res.status(400).json({ error: 'BRANCH_ID_REQUIRED' });
    const items = await drawerService.listDiscrepancies(branchId);
    res.json(items);
});

export const resolveDiscrepancy = handle(async (req, res) => {
    const discrepancyId = getStringParam((req.params as any).id);
    if (!discrepancyId) return res.status(400).json({ error: 'DISCREPANCY_ID_REQUIRED' });
    const approvedBy = req.user?.id;
    const result = await drawerService.resolveDiscrepancy({
        discrepancyId,
        resolution: req.body?.resolution,
        approvedBy,
        amountPaid: req.body?.amountPaid,
        notes: req.body?.notes,
    });
    res.json(result);
});

export const payDebt = handle(async (req, res) => {
    const discrepancyId = getStringParam((req.params as any).id);
    if (!discrepancyId) return res.status(400).json({ error: 'DISCREPANCY_ID_REQUIRED' });
    const result = await drawerService.markDebtPaid(discrepancyId, Number(req.body?.amount || 0), req.body?.notes);
    res.json(result);
});

// ---------------------------------------------------------------------------
// Bank Accounts & Transfers
// ---------------------------------------------------------------------------
export const createBankAccount = handle(async (req, res) => {
    const branchId = getBranchId(req);
    if (!branchId) return res.status(400).json({ error: 'BRANCH_ID_REQUIRED' });
    const account = await bankingService.createAccount({
        branchId,
        name: req.body?.name,
        accountType: req.body?.accountType,
        institution: req.body?.institution,
        accountNumber: req.body?.accountNumber,
        openingBalance: req.body?.openingBalance,
    });
    res.status(201).json(account);
});

export const listBankAccounts = handle(async (req, res) => {
    const branchId = getBranchId(req);
    if (!branchId) return res.status(400).json({ error: 'BRANCH_ID_REQUIRED' });
    const accounts = await bankingService.listAccounts(branchId);
    res.json(accounts);
});

export const getAccountBalance = handle(async (req, res) => {
    const accountId = getStringParam((req.params as any).id);
    if (!accountId) return res.status(400).json({ error: 'ACCOUNT_ID_REQUIRED' });
    const result = await bankingService.accountBalance(accountId);
    res.json(result);
});

export const requestTransfer = handle(async (req, res) => {
    const branchId = getBranchId(req);
    if (!branchId) return res.status(400).json({ error: 'BRANCH_ID_REQUIRED' });
    const transfer = await bankingService.requestTransfer({
        branchId,
        fromAccountId: req.body?.fromAccountId,
        toAccountId: req.body?.toAccountId,
        amount: req.body?.amount,
        reason: req.body?.reason,
        requestedBy: req.user?.id,
    });
    res.status(201).json(transfer);
});

export const approveTransfer = handle(async (req, res) => {
    const transferId = getStringParam((req.params as any).id);
    if (!transferId) return res.status(400).json({ error: 'TRANSFER_ID_REQUIRED' });
    const result = await bankingService.approveTransfer(transferId, req.user?.id);
    res.json(result);
});

export const rejectTransfer = handle(async (req, res) => {
    const transferId = getStringParam((req.params as any).id);
    if (!transferId) return res.status(400).json({ error: 'TRANSFER_ID_REQUIRED' });
    const result = await bankingService.rejectTransfer(transferId, req.user?.id);
    res.json(result);
});

export const listTransfers = handle(async (req, res) => {
    const branchId = getBranchId(req);
    if (!branchId) return res.status(400).json({ error: 'BRANCH_ID_REQUIRED' });
    const transfers = await bankingService.listTransfers(branchId);
    res.json(transfers);
});

// ---------------------------------------------------------------------------
// Supplier Invoice 3-Way Matching
// ---------------------------------------------------------------------------
export const computeInvoiceMatch = handle(async (req, res) => {
    const invoiceId = getStringParam((req.params as any).id) || getStringParam(req.body?.supplierInvoiceId);
    if (!invoiceId) return res.status(400).json({ error: 'INVOICE_ID_REQUIRED' });
    const match = await matchingService.computeMatch(invoiceId);
    res.json(match);
});

export const reviewInvoiceMatch = handle(async (req, res) => {
    const matchId = getStringParam((req.params as any).id);
    if (!matchId) return res.status(400).json({ error: 'MATCH_ID_REQUIRED' });
    const updated = await matchingService.updateMatch(matchId, req.body || {}, req.user?.id);
    res.json(updated);
});

export const getInvoiceMatch = handle(async (req, res) => {
    const invoiceId = getStringParam((req.params as any).id);
    if (!invoiceId) return res.status(400).json({ error: 'INVOICE_ID_REQUIRED' });
    const match = await matchingService.latestMatchForInvoice(invoiceId);
    res.json(match);
});

export const checkMatchBlocking = handle(async (req, res) => {
    const invoiceId = getStringParam((req.params as any).id) || getStringParam(req.query.invoiceId as string);
    if (!invoiceId) return res.status(400).json({ error: 'INVOICE_ID_REQUIRED' });
    const blocking = await matchingService.isMatchBlockingPayment(invoiceId);
    res.json({ invoiceId, blockingPayment: Boolean(blocking), matchStatus: blocking ? String((blocking as any).matchStatus) : null });
});

// ---------------------------------------------------------------------------
// Tip Pools
// ---------------------------------------------------------------------------
export const createTipPool = handle(async (req, res) => {
    const branchId = getBranchId(req);
    if (!branchId) return res.status(400).json({ error: 'BRANCH_ID_REQUIRED' });
    const pool = await tipPoolService.createPool({
        branchId,
        shiftId: req.body?.shiftId,
        pooledAmount: req.body?.pooledAmount,
        paymentMethod: req.body?.paymentMethod,
    });
    res.status(201).json(pool);
});

export const allocateTipPool = handle(async (req, res) => {
    const poolId = getStringParam((req.params as any).id);
    if (!poolId) return res.status(400).json({ error: 'POOL_ID_REQUIRED' });
    const allocations = await tipPoolService.allocatePool(poolId, req.body || {});
    res.json(allocations);
});

export const payOutTipPool = handle(async (req, res) => {
    const poolId = getStringParam((req.params as any).id);
    if (!poolId) return res.status(400).json({ error: 'POOL_ID_REQUIRED' });
    const updated = await tipPoolService.payOut(poolId, req.user?.id);
    res.json(updated);
});

export const listTipPools = handle(async (req, res) => {
    const branchId = getBranchId(req);
    if (!branchId) return res.status(400).json({ error: 'BRANCH_ID_REQUIRED' });
    const pools = await tipPoolService.listPools(branchId);
    res.json(pools);
});

export const getTipPoolDetail = handle(async (req, res) => {
    const poolId = getStringParam((req.params as any).id);
    if (!poolId) return res.status(400).json({ error: 'POOL_ID_REQUIRED' });
    const detail = await tipPoolService.poolDetail(poolId);
    if (!detail) return res.status(404).json({ error: 'TIP_POOL_NOT_FOUND' });
    res.json(detail);
});

// ---------------------------------------------------------------------------
// Gift Cards
// ---------------------------------------------------------------------------
export const issueGiftCard = handle(async (req, res) => {
    const branchId = getBranchId(req);
    if (!branchId) return res.status(400).json({ error: 'BRANCH_ID_REQUIRED' });
    const card = await giftCardService.issue({
        amount: req.body?.amount,
        branchId,
        customerId: req.body?.customerId,
        purchasedOrderId: req.body?.purchasedOrderId,
        createdBy: req.user?.id,
        expiresAt: req.body?.expiresAt ? new Date(req.body.expiresAt) : undefined,
    });
    res.status(201).json(card);
});

export const topupGiftCard = handle(async (req, res) => {
    const cardId = getStringParam((req.params as any).id);
    if (!cardId) return res.status(400).json({ error: 'CARD_ID_REQUIRED' });
    const updated = await giftCardService.topup(cardId, Number(req.body?.amount || 0), req.user?.id);
    res.json(updated);
});

export const redeemGiftCard = handle(async (req, res) => {
    const cardId = getStringParam((req.params as any).id);
    if (!cardId) return res.status(400).json({ error: 'CARD_ID_REQUIRED' });
    const updated = await giftCardService.redeem({
        cardId,
        amount: Number(req.body?.amount || 0),
        orderId: req.body?.orderId,
        createdBy: req.user?.id,
    });
    res.json(updated);
});

export const voidGiftCard = handle(async (req, res) => {
    const cardId = getStringParam((req.params as any).id);
    if (!cardId) return res.status(400).json({ error: 'CARD_ID_REQUIRED' });
    const updated = await giftCardService.void(cardId, req.user?.id);
    res.json(updated);
});

export const getGiftCard = handle(async (req, res) => {
    const codeOrId = getStringParam((req.params as any).id) || getStringParam(req.query.code as string);
    if (!codeOrId) return res.status(400).json({ error: 'CARD_CODE_OR_ID_REQUIRED' });
    const detail = await giftCardService.getCard(codeOrId);
    if (!detail) return res.status(404).json({ error: 'GIFT_CARD_NOT_FOUND' });
    res.json(detail);
});

export const listGiftCards = handle(async (req, res) => {
    const branchId = getBranchId(req);
    if (!branchId) return res.status(400).json({ error: 'BRANCH_ID_REQUIRED' });
    const cards = await giftCardService.listByBranch(branchId);
    res.json(cards);
});

// ---------------------------------------------------------------------------
// Payment Gateways
// ---------------------------------------------------------------------------
export const configureGatewayProvider = handle(async (req, res) => {
    const branchId = getBranchId(req);
    if (!branchId) return res.status(400).json({ error: 'BRANCH_ID_REQUIRED' });
    const provider = await paymentGatewayService.configureProvider({ branchId, ...req.body });
    res.status(201).json(provider);
});

export const listGatewayProviders = handle(async (req, res) => {
    const branchId = getBranchId(req);
    if (!branchId) return res.status(400).json({ error: 'BRANCH_ID_REQUIRED' });
    const providers = await paymentGatewayService.listProviders(branchId);
    res.json(providers);
});

export const createGatewayCheckout = handle(async (req, res) => {
    const branchId = getBranchId(req);
    if (!branchId) return res.status(400).json({ error: 'BRANCH_ID_REQUIRED' });
    const result = await paymentGatewayService.createCheckout({
        branchId,
        provider: req.body?.provider,
        orderId: req.body?.orderId,
        giftCardId: req.body?.giftCardId,
        amount: req.body?.amount,
        paymentMethodType: req.body?.paymentMethodType,
        createdBy: req.user?.id,
    });
    res.status(result.checkoutUrl ? 201 : 200).json(result);
});

export const gatewayWebhook = handle(async (req, res) => {
    const provider = getStringParam((req.params as any).provider);
    if (!provider) return res.status(400).json({ error: 'PROVIDER_REQUIRED' });
    const result = await paymentGatewayService.handleWebhook(provider, req.body);
    res.status(200).json(result);
});

export const refundGatewaySession = handle(async (req, res) => {
    const sessionId = getStringParam((req.params as any).id);
    if (!sessionId) return res.status(400).json({ error: 'SESSION_ID_REQUIRED' });
    const result = await paymentGatewayService.refund(sessionId);
    res.json(result);
});

export const listGatewaySessions = handle(async (req, res) => {
    const branchId = getBranchId(req);
    if (!branchId) return res.status(400).json({ error: 'BRANCH_ID_REQUIRED' });
    const sessions = await paymentGatewayService.listSessions(branchId);
    res.json(sessions);
});

// ---------------------------------------------------------------------------
// Daily P&L
// ---------------------------------------------------------------------------
export const computeDailyPnl = handle(async (req, res) => {
    const branchId = getBranchId(req);
    if (!branchId) return res.status(400).json({ error: 'BRANCH_ID_REQUIRED' });
    const businessDate = getStringParam(req.body?.businessDate) || getStringParam(req.query.date as string);
    if (!businessDate) return res.status(400).json({ error: 'BUSINESS_DATE_REQUIRED' });
    const snapshot = await dailyPnlService.computeDailyPnl({
        branchId,
        businessDate,
        finalizedBy: req.body?.finalize ? req.user?.id : undefined,
    });
    res.json(snapshot);
});

export const finalizeDailyPnl = handle(async (req, res) => {
    const branchId = getBranchId(req);
    if (!branchId) return res.status(400).json({ error: 'BRANCH_ID_REQUIRED' });
    const businessDate = getStringParam((req.params as any).date) || getStringParam(req.body?.businessDate);
    if (!businessDate) return res.status(400).json({ error: 'BUSINESS_DATE_REQUIRED' });
    const snapshot = await dailyPnlService.finalize(branchId, businessDate, req.user?.id);
    res.json(snapshot);
});

export const listDailyPnl = handle(async (req, res) => {
    const branchId = getBranchId(req);
    if (!branchId) return res.status(400).json({ error: 'BRANCH_ID_REQUIRED' });
    const snapshots = await dailyPnlService.list(
        branchId,
        getStringParam(req.query.from as string),
        getStringParam(req.query.to as string),
    );
    res.json(snapshots);
});

export const getLatestDailyPnl = handle(async (req, res) => {
    const branchId = getBranchId(req);
    if (!branchId) return res.status(400).json({ error: 'BRANCH_ID_REQUIRED' });
    const snapshot = await dailyPnlService.latest(branchId);
    res.json(snapshot);
});
