import { Router } from 'express';
import { marketingController } from '../controllers/marketingController';
import { authenticateToken, requireRoles, requireRoleOrPermission } from '../middleware/auth';

const router = Router();

// Secure all marketing boundaries
router.use(authenticateToken);

// Coupons
router.get('/coupons', marketingController.getCoupons);
router.post('/coupons', requireRoleOrPermission(
    ['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'MARKETING_MANAGER'],
    ['OP_APPLY_DISCOUNT'],
), marketingController.createCoupon);

// Complaints — inbox viewing stays managerial; filing is open to the
// frontline roles that actually receive customer complaints (counter,
// phones, floor). DRIVER and other unrelated roles are excluded.
const complaintViewers = ['SUPER_ADMIN', 'OWNER', 'GENERAL_MANAGER', 'BRANCH_MANAGER', 'MANAGER', 'CALL_CENTER_MANAGER', 'CAFE_ADMIN'];
const complaintFilers = [...complaintViewers, 'CALL_CENTER', 'CASHIER', 'CASHIER_MANAGER', 'WAITER', 'CAPTAIN', 'PICKUP_STAFF'];
router.get('/complaints', requireRoles(...complaintViewers), marketingController.getComplaints);
router.post('/complaints', requireRoles(...complaintFilers), marketingController.createComplaint);
router.put('/complaints/:id', requireRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'MANAGER', 'CALL_CENTER_MANAGER'), marketingController.updateComplaint);

export default router;
