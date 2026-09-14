import { Router } from 'express';
import * as budgetController from '../controllers/budgetController';
import { requireRoles } from '../middleware/auth';

const router = Router();

const financeAuth = requireRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'ACCOUNTANT', 'FINANCE_DIRECTOR');

// Read
router.get('/', budgetController.getBudgets);
router.get('/:id', budgetController.getBudgetById);
router.get('/:id/vs-actual', budgetController.getBudgetVsActual);

// Mutations — restricted
router.post('/', financeAuth, budgetController.createBudget);
router.put('/:id', financeAuth, budgetController.updateBudget);
router.delete('/:id', requireRoles('SUPER_ADMIN', 'OWNER', 'FINANCE_DIRECTOR'), budgetController.deleteBudget);

export default router;
