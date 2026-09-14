import { Router } from 'express';
import { getWarehouses, createWarehouse, updateWarehouse, deactivateWarehouse } from '../controllers/warehouseController';
import { requireRoles } from '../middleware/auth';
import { enforceBranch } from '../middleware/branchIsolation';

const router = Router();
const posAuth = requireRoles('SUPER_ADMIN', 'BRANCH_MANAGER', 'MANAGER', 'CASHIER', 'WAITER');
const managerAuth = requireRoles('SUPER_ADMIN', 'BRANCH_MANAGER', 'MANAGER');

router.get('/', posAuth, enforceBranch, getWarehouses);
router.post('/', managerAuth, enforceBranch, createWarehouse);
router.put('/:id', managerAuth, enforceBranch, updateWarehouse);
router.delete('/:id', managerAuth, enforceBranch, deactivateWarehouse);

export default router;
