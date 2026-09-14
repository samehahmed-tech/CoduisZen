import { Router } from 'express';
import { authenticateToken, requireRoles } from '../middleware/auth';
import { enforceBranch } from '../middleware/branchIsolation';
import * as p1 from '../controllers/p1FinanceController';

// Same role allow-list used by the core finance routes (kept in sync with financeRoutes.ts)
const financeAuth = [
    authenticateToken,
    requireRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'ACCOUNTANT', 'FINANCE_DIRECTOR', 'COST_ACCOUNTANT', 'TREASURY_OFFICER'),
];

const router = Router();
router.use(financeAuth, enforceBranch);

// Cash drawer reconciliation (open / count / close / discrepancies)
router.post('/drawers/open', p1.openDrawer);
router.get('/drawers/active', p1.getActiveDrawer);
router.post('/drawers/count/:id', p1.recordDrawerCount);
router.get('/drawers/count/:id', p1.getDrawerCount);
router.post('/drawers/close/:id', p1.closeDrawer);
router.get('/drawers', p1.listDrawers);
router.get('/drawers/discrepancies', p1.listDiscrepancies);
router.post('/drawers/discrepancies/:id/resolve', p1.resolveDiscrepancy);

// Banking: accounts, balances, transfers (maker/checker)
router.post('/bank-accounts', p1.createBankAccount);
router.get('/bank-accounts', p1.listBankAccounts);
router.get('/bank-accounts/:id/balance', p1.getAccountBalance);
router.post('/transfers/request', p1.requestTransfer);
router.post('/transfers/:id/approve', p1.approveTransfer);
router.post('/transfers/:id/reject', p1.rejectTransfer);
router.get('/transfers', p1.listTransfers);

// Treasury vouchers — سندات القبض والصرف (محاسب الخزينة)
import * as treasury from '../controllers/treasuryController';
router.get('/treasury/overview', treasury.getOverview);
router.get('/treasury/vouchers', treasury.listVouchers);
router.post('/treasury/vouchers', treasury.createVoucher);
router.post('/treasury/vouchers/:id/approve', treasury.approveVoucher);
router.post('/treasury/vouchers/:id/reject', treasury.rejectVoucher);
router.post('/treasury/vouchers/:id/cancel', treasury.cancelVoucher);
router.get('/treasury/supplier-statement/:id', treasury.getSupplierStatement);
router.get('/treasury/custody', treasury.getCustody);

// Supplier invoice 3-way matching (PO / receipt / invoice)
router.post('/invoices/match', p1.computeInvoiceMatch);
router.post('/invoices/match/:id/review', p1.reviewInvoiceMatch);
router.get('/invoices/match/:id', p1.getInvoiceMatch);
router.post('/invoices/match/blocking', p1.checkMatchBlocking);

// Tip pooling and allocation
router.post('/tip-pools', p1.createTipPool);
router.post('/tip-pools/:id/allocate', p1.allocateTipPool);
router.post('/tip-pools/:id/payout', p1.payOutTipPool);
router.get('/tip-pools', p1.listTipPools);
router.get('/tip-pools/:id', p1.getTipPoolDetail);

// Gift cards (issue / top-up / redeem / void)
router.post('/gift-cards/issue', p1.issueGiftCard);
router.post('/gift-cards/topup', p1.topupGiftCard);
router.post('/gift-cards/redeem', p1.redeemGiftCard);
router.post('/gift-cards/void', p1.voidGiftCard);
router.get('/gift-cards/:code', p1.getGiftCard);
router.get('/gift-cards', p1.listGiftCards);

// Payment gateway integration (Paymob / Fawry / InstaPay)
router.post('/gateways/providers', p1.configureGatewayProvider);
router.get('/gateways/providers', p1.listGatewayProviders);
router.post('/gateways/checkout', p1.createGatewayCheckout);
router.post('/gateways/webhook/:provider', p1.gatewayWebhook);
router.post('/gateways/sessions/:id/refund', p1.refundGatewaySession);
router.get('/gateways/sessions', p1.listGatewaySessions);

// Daily P&L snapshots (revenue, food cost %, labor cost %)
router.post('/pnl/compute', p1.computeDailyPnl);
router.post('/pnl/finalize', p1.finalizeDailyPnl);
router.get('/pnl', p1.listDailyPnl);
router.get('/pnl/latest', p1.getLatestDailyPnl);

export default router;
