import { Router } from 'express';
import * as orderController from '../controllers/orderController';
import { validate } from '../middleware/validate';
import { createOrderSchema, updateOrderStatusSchema } from '../middleware/validation';
import { requireRoles } from '../middleware/auth';
import { enforceBranch } from '../middleware/branchIsolation';

const router = Router();
const posAuth = requireRoles('SUPER_ADMIN', 'BRANCH_MANAGER', 'MANAGER', 'CASHIER', 'WAITER');
const orderReadAuth = requireRoles('SUPER_ADMIN', 'BRANCH_MANAGER', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN_STAFF', 'PICKUP_STAFF');

router.get('/', orderReadAuth, enforceBranch, orderController.getAllOrders);
router.post('/coupons/validate', posAuth, orderController.validateCoupon);
router.post('/', posAuth, enforceBranch, validate(createOrderSchema), orderController.createOrder);
router.post('/split', posAuth, enforceBranch, orderController.splitOrder);
router.put('/:id/customer', posAuth, enforceBranch, orderController.updateOrderCustomer);
router.put('/:id/status', posAuth, enforceBranch, validate(updateOrderStatusSchema), orderController.updateOrderStatus);

export default router;
