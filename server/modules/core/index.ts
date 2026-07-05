import { Router } from 'express';
import authRoutes from '../../routes/authRoutes';
import branchRoutes from '../../routes/branchRoutes';
import settingsRoutes from '../../routes/settingsRoutes';
import setupRoutes from '../../routes/setupRoutes';
import subscriptionRoutes from '../../routes/subscriptionRoutes';
import auditRoutes from '../../routes/auditRoutes';
import imageRoutes from '../../routes/imageRoutes';
import printerRoutes from '../../routes/printerRoutes';
import printGatewayRoutes from '../../routes/printGatewayRoutes';

const router = Router();

router.use('/auth', authRoutes); // Note: /api/auth is usually separate, but we bundle here for logic
router.use('/branches', branchRoutes);
router.use('/settings', settingsRoutes);
router.use('/setup', setupRoutes);
router.use('/subscriptions', subscriptionRoutes);
router.use('/audit', auditRoutes);
router.use('/images', imageRoutes);
router.use('/printers', printerRoutes);
router.use('/print-gateway', printGatewayRoutes);

export default router;
