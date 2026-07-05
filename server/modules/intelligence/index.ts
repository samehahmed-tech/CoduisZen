import { Router } from 'express';
import aiRoutes from '../../routes/aiRoutes';
import analyticsRoutes from '../../routes/analyticsRoutes';
import reportRoutes from '../../routes/reportRoutes';

const router = Router();

router.use('/ai', aiRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/reports', reportRoutes);

export default router;
