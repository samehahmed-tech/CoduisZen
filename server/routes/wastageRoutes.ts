import { Router } from 'express';
import * as wastageController from '../controllers/wastageController';
import { requireRoleOrPermission } from '../middleware/auth';

const router = Router();

router.post('/', requireRoleOrPermission(
    ['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'WAREHOUSE_STAFF', 'KITCHEN_STAFF'],
    ['OP_MANAGE_WASTAGE'],
), wastageController.recordWastage);
router.get('/report', wastageController.getWastageReport);
router.get('/recent', wastageController.getRecentWastage);

export default router;
