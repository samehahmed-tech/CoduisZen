import { Router } from 'express';
import * as shiftController from '../controllers/shiftController';
import { requireRoles } from '../middleware/auth';
import { enforceBranch } from '../middleware/branchIsolation';

const router = Router();
const posAuth = requireRoles('SUPER_ADMIN', 'BRANCH_MANAGER', 'MANAGER', 'CASHIER', 'WAITER');

router.get('/active', posAuth, enforceBranch, shiftController.getActiveShift);
router.get('/:id/x-report', posAuth, enforceBranch, shiftController.getXReport);
router.post('/open', posAuth, enforceBranch, shiftController.openShift);
router.put('/:id/close', posAuth, enforceBranch, shiftController.closeShift);

export default router;
