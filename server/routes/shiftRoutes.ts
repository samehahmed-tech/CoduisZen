import { Router } from 'express';
import * as shiftController from '../controllers/shiftController';
import { requireRoles } from '../middleware/auth';
import { enforceBranch } from '../middleware/branchIsolation';
import { POS_FLOOR_ROLES } from '../utils/operationalRoles';

const router = Router();
const posAuth = requireRoles(...POS_FLOOR_ROLES);

router.get('/active', posAuth, enforceBranch, shiftController.getActiveShift);
router.get('/open-shifts', posAuth, enforceBranch, shiftController.getOpenShifts);
router.get('/:id/x-report', posAuth, enforceBranch, shiftController.getXReport);
router.post('/open', posAuth, enforceBranch, shiftController.openShift);
router.put('/:id/close', posAuth, enforceBranch, shiftController.closeShift);

export default router;
