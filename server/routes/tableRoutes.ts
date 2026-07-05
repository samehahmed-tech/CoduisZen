import { Router } from 'express';
import { getTables, getZones, saveLayout, updateTableStatus, transferTableOrder, splitTableOrder, mergeTableOrders } from '../controllers/tableController';
import { requireRoleOrPermission } from '../middleware/auth';
import { enforceBranch } from '../middleware/branchIsolation';

const router = Router();
const posAuth = requireRoleOrPermission(
    ['SUPER_ADMIN', 'BRANCH_MANAGER', 'MANAGER', 'CASHIER', 'WAITER', 'CAPTAIN'],
    ['NAV_POS', 'NAV_FLOOR_PLAN', 'OP_PLACE_ORDER']
);
const managerAuth = requireRoleOrPermission(
    ['SUPER_ADMIN', 'BRANCH_MANAGER', 'MANAGER', 'CAPTAIN'],
    ['CFG_EDIT_FLOOR_PLAN']
);

router.get('/', posAuth, enforceBranch, getTables);
router.get('/zones', posAuth, enforceBranch, getZones);
router.post('/layout', managerAuth, enforceBranch, saveLayout); // Save full layout
router.post('/transfer', posAuth, enforceBranch, transferTableOrder);
router.post('/split', posAuth, enforceBranch, splitTableOrder);
router.post('/merge', posAuth, enforceBranch, mergeTableOrders);
router.put('/:id/status', posAuth, enforceBranch, updateTableStatus); // Sync status

export default router;
