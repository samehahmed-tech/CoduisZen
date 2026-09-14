import { Router } from 'express';
import * as financeController from '../controllers/financeController';
import { validate } from '../middleware/validate';
import { createJournalSchema } from '../middleware/validation';
import {
    getRecurringTemplates,
    createRecurringTemplate,
    updateRecurringTemplate,
    deleteRecurringTemplate,
    processDueRecurringEntries
} from '../controllers/recurringEntriesController';
import { requireRoles } from '../middleware/auth';
import { enforceBranch } from '../middleware/branchIsolation';

const router = Router();
const financeAuth = requireRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'ACCOUNTANT', 'FINANCE_DIRECTOR', 'COST_ACCOUNTANT', 'TREASURY_OFFICER');
const accountAdmin = requireRoles('SUPER_ADMIN', 'OWNER', 'FINANCE_DIRECTOR');

router.get('/accounts', financeAuth, enforceBranch, financeController.getAccounts);
router.get('/accounts/archived', accountAdmin, enforceBranch, financeController.getArchivedAccounts);
router.post('/accounts/expense', financeAuth, enforceBranch, financeController.createExpenseAccount);
router.post('/accounts', accountAdmin, enforceBranch, financeController.createAccount);
router.post('/accounts/reset', accountAdmin, enforceBranch, financeController.resetChartOfAccounts);
router.put('/accounts/:id', accountAdmin, enforceBranch, financeController.updateAccount);
router.delete('/accounts/:id', accountAdmin, enforceBranch, financeController.deactivateAccount);
router.post('/accounts/:id/restore', accountAdmin, enforceBranch, financeController.restoreAccount);
router.get('/journal', financeAuth, enforceBranch, financeController.getJournal);
router.post('/journal', financeAuth, enforceBranch, validate(createJournalSchema), financeController.createJournalEntry);
router.put('/journal/:id/approve', accountAdmin, enforceBranch, financeController.approveJournalEntry);
router.put('/journal/:id/reverse', financeAuth, enforceBranch, financeController.reverseJournalEntry);
router.get('/trial-balance', financeAuth, enforceBranch, financeController.getTrialBalance);
router.get('/reconciliations', financeAuth, enforceBranch, financeController.getReconciliations);
router.post('/reconciliations', financeAuth, enforceBranch, financeController.createReconciliation);
router.put('/reconciliations/:id/resolve', financeAuth, enforceBranch, financeController.resolveReconciliation);
router.get('/period-closes', financeAuth, enforceBranch, financeController.getPeriodCloses);
router.post('/period-close', financeAuth, enforceBranch, financeController.closePeriod);

// Exceptions
router.get('/exceptions', financeAuth, enforceBranch, financeController.getExceptions);
router.post('/exceptions/:id/resolve', financeAuth, enforceBranch, financeController.resolveException);

// Financial Statements
router.get('/statements/pnl', financeAuth, enforceBranch, financeController.getProfitAndLoss);
router.get('/statements/balance-sheet', financeAuth, enforceBranch, financeController.getBalanceSheet);
router.get('/statements/cash-flow', financeAuth, enforceBranch, financeController.getCashFlowStatement);
router.get('/statements/ar', financeAuth, enforceBranch, financeController.getAccountsReceivable);
router.get('/statements/ap', financeAuth, enforceBranch, financeController.getAccountsPayable);

// Recurring Journal Entries
router.get('/recurring', financeAuth, enforceBranch, getRecurringTemplates);
router.post('/recurring', financeAuth, enforceBranch, createRecurringTemplate);
router.put('/recurring/:id', financeAuth, enforceBranch, updateRecurringTemplate);
router.delete('/recurring/:id', financeAuth, enforceBranch, deleteRecurringTemplate);
router.post('/recurring/process', financeAuth, enforceBranch, processDueRecurringEntries);

// COA Mappings and Posting Rules
import * as coaMappingController from '../controllers/coaMappingController';
router.get('/mappings/rules', financeAuth, enforceBranch, coaMappingController.getPostingRules);
router.post('/mappings/rules', accountAdmin, enforceBranch, coaMappingController.createPostingRule);
router.put('/mappings/rules/:id', financeAuth, enforceBranch, coaMappingController.updatePostingRule);
router.delete('/mappings/rules/:id', accountAdmin, enforceBranch, coaMappingController.deletePostingRule);
router.get('/mappings/payment', financeAuth, enforceBranch, coaMappingController.getPaymentMappings);
router.put('/mappings/payment/:id', financeAuth, enforceBranch, coaMappingController.updatePaymentMapping);
router.get('/mappings/tax', financeAuth, enforceBranch, coaMappingController.getTaxMappings);
router.put('/mappings/tax/:id', financeAuth, enforceBranch, coaMappingController.updateTaxMapping);

export default router;
