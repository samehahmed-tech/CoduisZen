import { Router } from 'express';
import * as approvalController from '../controllers/approvalController';
import { requireRoleOrPermission } from '../middleware/auth';
import { POS_FLOOR_ROLES } from '../utils/operationalRoles';

const router = Router();

// Verification endpoints authenticate via the MANAGER's PIN/password sent in
// the body — so the caller's own role must NOT gate them. The normal flow is
// a cashier/waiter asking a manager to approve (discount, void, refund); a
// caller-side role check turns that into a false 403 FORBIDDEN.
router.post('/verify-pin', approvalController.verifyManagerPin);
router.post('/verify-password', approvalController.verifyManagerPassword);

// Listing / creating / rejecting approvals: floor roles by default, or anyone
// holding a related operation permission from the Roles screen.
const approvalsAuth = requireRoleOrPermission(
    [...POS_FLOOR_ROLES, 'CALL_CENTER', 'CALL_CENTER_MANAGER', 'CALL_CENTER_AGENT'],
    ['OP_VOID_ORDER', 'OP_APPLY_DISCOUNT', 'OP_PROCESS_REFUND'],
);
router.get('/', approvalsAuth, approvalController.getApprovals);
router.post('/', approvalsAuth, approvalController.createApproval);
router.put('/:id/reject', approvalsAuth, approvalController.rejectApproval);

export default router;
