import { Router } from 'express';
import * as ctrl from '../controllers/refundController';
import { validate } from '../middleware/validate';
import { createRefundSchema } from '../middleware/validation';
import { requireRoles } from '../middleware/auth';
import { enforceBranch, scopeBranchQuery } from '../middleware/branchIsolation';

const router = Router();
const refundRead = requireRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'MANAGER', 'CASHIER_MANAGER', 'ACCOUNTANT', 'FINANCE_DIRECTOR');
const refundManage = requireRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'CASHIER_MANAGER');
// Counter staff may REQUEST returns (approve/process stay restricted).
const refundRequest = requireRoles('SUPER_ADMIN', 'OWNER', 'GENERAL_MANAGER', 'BRANCH_MANAGER', 'CASHIER_MANAGER', 'CASHIER', 'WAITER', 'CAPTAIN', 'CAFE_ADMIN', 'CALL_CENTER', 'CALL_CENTER_MANAGER');

// Refund read
router.get('/', refundRead, scopeBranchQuery, ctrl.getRefunds);
router.get('/stats', refundRead, scopeBranchQuery, ctrl.getRefundStats);
router.get('/policy', refundRead, ctrl.getRefundPolicy);
router.get('/:id', refundRead, enforceBranch, ctrl.getRefundById);

// Refund mutations — restricted
router.put('/policy', requireRoles('SUPER_ADMIN', 'OWNER'), ctrl.updateRefundPolicy);
router.post('/', refundRequest, enforceBranch, validate(createRefundSchema), ctrl.requestRefund);
router.put('/:id/approve', refundManage, enforceBranch, ctrl.approveRefund);
router.put('/:id/reject', refundManage, enforceBranch, ctrl.rejectRefund);
router.post('/:id/process', refundManage, enforceBranch, ctrl.processRefund);

export default router;
