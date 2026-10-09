import { Router } from 'express';
import { kdsController } from '../controllers/kdsController';
import { authenticateToken, requireRoleOrPermission } from '../middleware/auth';
import { enforceBranch } from '../middleware/branchIsolation';
import { POS_FLOOR_ROLES } from '../utils/operationalRoles';

const router = Router();

// Secure all KDS boundaries
router.use(authenticateToken);
router.use(enforceBranch);

// Reads stay open (kitchen screens poll constantly).
// Dispatch rides the order-placing flow (POS cashiers fire it on every send),
// so it follows order placement access — never narrower.
// Bump/recall/toggle/handover are kitchen-side ops with their own permission.
const kdsDispatch = requireRoleOrPermission(
    [...POS_FLOOR_ROLES, 'CALL_CENTER', 'CALL_CENTER_MANAGER'],
    ['OP_PLACE_ORDER'],
);
const kdsOperate = requireRoleOrPermission(
    ['SUPER_ADMIN', 'OWNER', 'GENERAL_MANAGER', 'BRANCH_MANAGER', 'MANAGER', 'KITCHEN_STAFF', 'CAPTAIN', 'PICKUP_STAFF', 'CAFE_ADMIN', 'CASHIER_MANAGER'],
    ['OP_KDS_OPERATE'],
);

router.get('/meta', kdsController.getMeta);
router.get('/', kdsController.getTickets);
router.post('/dispatch', kdsDispatch, kdsController.dispatchOrder);
router.post('/orders/:orderId/handover', kdsOperate, kdsController.handoverOrder);
router.post('/:id/bump', kdsOperate, kdsController.bumpTicket);
router.post('/:id/recall', kdsOperate, kdsController.recallTicket);
router.put('/:id/items/:itemId/toggle', kdsOperate, kdsController.toggleItem);

export default router;
