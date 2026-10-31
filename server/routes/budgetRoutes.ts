import { Router } from 'express';
import * as budgetController from '../controllers/budgetController';
import { requireRoles, requireRoleOrPermission } from '../middleware/auth';
import { enforceBranch } from '../middleware/branchIsolation';

const router = Router();

const financeAuth = requireRoleOrPermission(
    ['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'ACCOUNTANT', 'FINANCE_DIRECTOR'],
    ['OP_MANAGE_BUDGETS'],
);

// Read
router.get('/', financeAuth, enforceBranch, budgetController.getBudgets);
router.get('/:id', financeAuth, enforceBranch, budgetController.getBudgetById);
router.get('/:id/vs-actual', financeAuth, enforceBranch, budgetController.getBudgetVsActual);

// Mutations — restricted
router.post('/', financeAuth, enforceBranch, budgetController.createBudget);
router.put('/:id', financeAuth, enforceBranch, budgetController.updateBudget);
router.delete('/:id', requireRoles('SUPER_ADMIN', 'OWNER', 'FINANCE_DIRECTOR'), enforceBranch, budgetController.deleteBudget);

export default router;
