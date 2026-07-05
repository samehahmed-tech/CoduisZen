import { Router } from 'express';
import {
    getDayCloseReport,
    closeDay,
    getDayCloseHistory,
    sendDayCloseEmail
} from '../controllers/dayCloseController';
import { requireRoles } from '../middleware/auth';
import { enforceBranch } from '../middleware/branchIsolation';

const router = Router();

// Get day close history for a branch
router.get('/:branchId/history', enforceBranch, getDayCloseHistory);

// Get day close report preview
router.get('/:branchId/:date', enforceBranch, getDayCloseReport);

// Close the day — restricted to managers
router.post('/:branchId/:date/close', enforceBranch, requireRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'CASHIER_MANAGER'), closeDay);

// Send email report
router.post('/:branchId/:date/send-email', enforceBranch, requireRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER'), sendDayCloseEmail);

export default router;
