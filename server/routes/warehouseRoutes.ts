import { Router } from 'express';
import { getWarehouses, createWarehouse } from '../controllers/warehouseController';
import { requireRoles } from '../middleware/auth';

const router = Router();
const posAuth = requireRoles('SUPER_ADMIN', 'BRANCH_MANAGER', 'MANAGER', 'CASHIER', 'WAITER');
const managerAuth = requireRoles('SUPER_ADMIN', 'BRANCH_MANAGER', 'MANAGER');

router.get('/', posAuth, getWarehouses);
router.post('/', managerAuth, createWarehouse);

export default router;
