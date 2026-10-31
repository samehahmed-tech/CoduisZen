import { Router } from 'express';
import * as wastageController from '../controllers/wastageController';
import { requireRoleOrPermission } from '../middleware/auth';
import { enforceBranch } from '../middleware/branchIsolation';

const router = Router();

router.use(enforceBranch);

const wastageReadAuth = requireRoleOrPermission(
    ['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'WAREHOUSE_STAFF', 'KITCHEN_STAFF', 'WAREHOUSE_DIRECTOR'],
    ['OP_MANAGE_WASTAGE'],
);

router.post('/', requireRoleOrPermission(
    ['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'WAREHOUSE_STAFF', 'KITCHEN_STAFF'],
    ['OP_MANAGE_WASTAGE'],
), wastageController.recordWastage);
router.get('/report', wastageReadAuth, wastageController.getWastageReport);
router.get('/recent', wastageReadAuth, wastageController.getRecentWastage);

export default router;
