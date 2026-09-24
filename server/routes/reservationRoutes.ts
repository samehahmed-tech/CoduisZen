import { Router } from 'express';
import { reservationController } from '../controllers/reservationController';
import { requireRoles } from '../middleware/auth';
import { enforceBranch } from '../middleware/branchIsolation';
import { POS_FLOOR_ROLES } from '../utils/operationalRoles';

const router = Router();
const hostessAuth = requireRoles(...POS_FLOOR_ROLES, 'CALL_CENTER', 'CALL_CENTER_MANAGER');

router.get('/', hostessAuth, enforceBranch, reservationController.list);
router.post('/', hostessAuth, enforceBranch, reservationController.create);
router.put('/:id/status', hostessAuth, enforceBranch, reservationController.setStatus);

export default router;
