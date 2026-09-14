import { Router } from 'express';
import * as orderController from '../controllers/orderController';
import { validate } from '../middleware/validate';
import { createOrderSchema, updateOrderStatusSchema } from '../middleware/validation';
import { requireRoles } from '../middleware/auth';
import { enforceBranch } from '../middleware/branchIsolation';

const router = Router();
// Call-center roles take/distribute delivery orders and monitor all branches,
// so they need the same order access as cashiers (create + read + status).
const posAuth = requireRoles('SUPER_ADMIN', 'BRANCH_MANAGER', 'MANAGER', 'CASHIER', 'WAITER', 'CALL_CENTER', 'CALL_CENTER_MANAGER');
const orderReadAuth = requireRoles('SUPER_ADMIN', 'BRANCH_MANAGER', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN_STAFF', 'PICKUP_STAFF', 'CALL_CENTER', 'CALL_CENTER_MANAGER');

router.get('/', orderReadAuth, enforceBranch, orderController.getAllOrders);
router.post('/coupons/validate', posAuth, orderController.validateCoupon);
router.post('/', posAuth, enforceBranch, validate(createOrderSchema), orderController.createOrder);
router.post('/split', posAuth, enforceBranch, orderController.splitOrder);
router.put('/:id/customer', posAuth, enforceBranch, orderController.updateOrderCustomer);
router.put('/:id/status', posAuth, enforceBranch, validate(updateOrderStatusSchema), orderController.updateOrderStatus);
router.put('/:id/items', posAuth, enforceBranch, orderController.updateOrderItems);

export default router;
