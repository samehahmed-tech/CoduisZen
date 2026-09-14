import { Router } from 'express';
import { marketingController } from '../controllers/marketingController';
import { authenticateToken, requireRoles } from '../middleware/auth';

const router = Router();

// Secure all marketing boundaries
router.use(authenticateToken);

// Coupons
router.get('/coupons', marketingController.getCoupons);
router.post('/coupons', requireRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'MARKETING_MANAGER'), marketingController.createCoupon);

// Complaints
router.get('/complaints', marketingController.getComplaints);
router.post('/complaints', marketingController.createComplaint);
router.put('/complaints/:id', requireRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'MANAGER', 'CALL_CENTER_MANAGER'), marketingController.updateComplaint);

export default router;
