import { Router } from 'express';
import {
    getDayCloseReport,
    downloadDayClosePdf,
    downloadDayCloseXlsx,
    closeDay,
    reopenDay,
    getDayCloseHistory,
    sendDayCloseEmail,
    updateBusinessDate
} from '../controllers/dayCloseController';
import { requireRoles, requireRoleOrPermission } from '../middleware/auth';
import { enforceBranch } from '../middleware/branchIsolation';

const router = Router();

// Get day close history for a branch
router.get('/:branchId/history', enforceBranch, getDayCloseHistory);
router.put('/:branchId/business-date', enforceBranch, requireRoleOrPermission(
    ['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER'],
    ['OP_CLOSE_DAY'],
), updateBusinessDate);

// Get day close report preview
router.get('/:branchId/:date/pdf', enforceBranch, downloadDayClosePdf);
router.get('/:branchId/:date/xlsx', enforceBranch, downloadDayCloseXlsx);
router.get('/:branchId/:date', enforceBranch, getDayCloseReport);

// Close the day — managers by role, or anyone explicitly granted OP_CLOSE_DAY
// from the Roles/Permissions screen (the permission lives on the user and
// rides the access token, so the grant takes effect on next token refresh).
// CAFE_ADMIN carries OP_CLOSE_DAY by design (shift-level manager like
// CASHIER_MANAGER) and must not get a false 403 here.
router.post('/:branchId/:date/close', enforceBranch, requireRoleOrPermission(
    ['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'CASHIER_MANAGER', 'CAFE_ADMIN'],
    ['OP_CLOSE_DAY'],
), closeDay);

// Reopen a wrongly-closed day (undo close) — top management only: this
// resurrects finalized orders and rewinds the business date, so an over-
// broad grant could silently undo real closures. Reason is required.
router.post('/:branchId/:date/reopen', enforceBranch, requireRoles('SUPER_ADMIN', 'OWNER', 'FINANCE_DIRECTOR'), reopenDay);

// Send email report
router.post('/:branchId/:date/send-email', enforceBranch, requireRoleOrPermission(
    ['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER'],
    ['OP_CLOSE_DAY'],
), sendDayCloseEmail);

export default router;
