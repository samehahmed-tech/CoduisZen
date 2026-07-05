import { Router } from 'express';
import * as wastageController from '../controllers/wastageController';
import { requireRoles } from '../middleware/auth';

const router = Router();

router.post('/', requireRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'WAREHOUSE_STAFF', 'KITCHEN_STAFF'), wastageController.recordWastage);
router.get('/report', wastageController.getWastageReport);
router.get('/recent', wastageController.getRecentWastage);

export default router;
