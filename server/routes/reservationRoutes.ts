import { Router } from 'express';
import { reservationController } from '../controllers/reservationController';
import { requireRoles } from '../middleware/auth';
import { enforceBranch } from '../middleware/branchIsolation';

const router = Router();
const hostessAuth = requireRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'MANAGER', 'CASHIER', 'WAITER', 'CAPTAIN', 'CALL_CENTER', 'CALL_CENTER_MANAGER');

router.get('/', hostessAuth, enforceBranch, reservationController.list);
router.post('/', hostessAuth, enforceBranch, reservationController.create);
router.put('/:id/status', hostessAuth, enforceBranch, reservationController.setStatus);

export default router;
