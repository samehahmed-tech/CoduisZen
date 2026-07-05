import { Router } from 'express';
import { marketingController } from '../controllers/marketingController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Secure all marketing boundaries
router.use(authenticateToken);

// Coupons
router.get('/coupons', marketingController.getCoupons);
router.post('/coupons', marketingController.createCoupon);

// Complaints
router.get('/complaints', marketingController.getComplaints);
router.post('/complaints', marketingController.createComplaint);

export default router;
