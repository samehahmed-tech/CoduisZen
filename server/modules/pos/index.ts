import { Router } from 'express';
import orderRoutes from '../../routes/orderRoutes';
import tableRoutes from '../../routes/tableRoutes';
import waitlistRoutes from '../../routes/waitlistRoutes';
import kdsRoutes from '../../routes/kdsRoutes';
import deliveryRoutes from '../../routes/deliveryRoutes';
import refundRoutes from '../../routes/refundRoutes';
import platformsRoutes from '../../routes/platformsRoutes';
import dayCloseRoutes from '../../routes/dayCloseRoutes';
import shiftRoutes from '../../routes/shiftRoutes';
import { requireRoles } from '../../middleware/auth';

const router = Router();

router.use('/orders', orderRoutes);
router.use('/tables', tableRoutes);
router.use('/waitlist', waitlistRoutes);
router.use('/kds', kdsRoutes);
router.use('/delivery', deliveryRoutes);
router.use('/refunds', refundRoutes);
router.use('/platforms', platformsRoutes);
router.use('/day-close', dayCloseRoutes);
router.use('/shifts', shiftRoutes);

export default router;
