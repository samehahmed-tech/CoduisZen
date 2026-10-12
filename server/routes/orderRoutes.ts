import { Router } from 'express';
import * as orderController from '../controllers/orderController';
import { validate } from '../middleware/validate';
import { createOrderSchema, updateOrderStatusSchema } from '../middleware/validation';
import { requireRoles, requireRoleOrPermission } from '../middleware/auth';
import { enforceBranch } from '../middleware/branchIsolation';
import { signTrackToken } from '../utils/trackToken';
import { POS_FLOOR_ROLES } from '../utils/operationalRoles';

const router = Router();
// Call-center roles take/distribute delivery orders and monitor all branches,
// so they need the same order access as cashiers (create + read + status).
// Permission fallback keeps the Roles screen effective: anyone explicitly
// granted OP_PLACE_ORDER / OP_APPLY_DISCOUNT passes regardless of role.
const posAuth = requireRoleOrPermission(
    [...POS_FLOOR_ROLES, 'CALL_CENTER', 'CALL_CENTER_MANAGER'],
    ['OP_PLACE_ORDER', 'OP_APPLY_DISCOUNT'],
);
const orderReadAuth = requireRoles(...POS_FLOOR_ROLES, 'KITCHEN_STAFF', 'PICKUP_STAFF', 'CALL_CENTER', 'CALL_CENTER_MANAGER');

router.get('/', orderReadAuth, enforceBranch, orderController.getAllOrders);
router.get('/:id', orderReadAuth, enforceBranch, orderController.getOrderById);
// Signed public-tracking link for the customer (resend when the WhatsApp
// send failed). Signed with the server secret — never forge client-side.
router.get('/:id/track-link', orderReadAuth, enforceBranch, (_req, res) => {
    const orderId = String((_req.params as any)?.id || '').trim();
    if (!orderId) return res.status(400).json({ ok: false, code: 'ORDER_ID_REQUIRED' });
    const token = signTrackToken(orderId);
    if (!token) return res.status(503).json({ ok: false, code: 'TRACK_SIGNING_UNAVAILABLE' });
    const base = String(process.env.PUBLIC_TRACKING_URL || process.env.FRONTEND_URL || '').replace(/\/+$/, '');
    return res.json({ ok: true, url: `${base || ''}/t/${orderId}?t=${token}` });
});
router.post('/coupons/validate', posAuth, orderController.validateCoupon);
router.post('/', posAuth, enforceBranch, validate(createOrderSchema), orderController.createOrder);
router.post('/split', posAuth, enforceBranch, orderController.splitOrder);
router.put('/:id/customer', posAuth, enforceBranch, orderController.updateOrderCustomer);
router.put('/:id/status', posAuth, enforceBranch, validate(updateOrderStatusSchema), orderController.updateOrderStatus);
router.put('/:id/items', posAuth, enforceBranch, orderController.updateOrderItems);

export default router;
