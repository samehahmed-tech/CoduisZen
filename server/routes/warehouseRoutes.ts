import { Router } from 'express';
import { getWarehouses, createWarehouse, updateWarehouse, deactivateWarehouse } from '../controllers/warehouseController';
import { requireRoles, requireRoleOrPermission } from '../middleware/auth';
import { enforceBranch } from '../middleware/branchIsolation';
import { POS_FLOOR_ROLES } from '../utils/operationalRoles';

const router = Router();
const posAuth = requireRoles(...POS_FLOOR_ROLES);
const managerAuth = requireRoleOrPermission(
    ['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'MANAGER'],
    ['CFG_MANAGE_WAREHOUSES'],
);

router.get('/', posAuth, enforceBranch, getWarehouses);
router.post('/', managerAuth, enforceBranch, createWarehouse);
router.put('/:id', managerAuth, enforceBranch, updateWarehouse);
router.delete('/:id', managerAuth, enforceBranch, deactivateWarehouse);

export default router;
