import { Router } from 'express';
import marketingRoutes from '../../routes/marketingRoutes';
import campaignRoutes from '../../routes/campaignRoutes';
import customerRoutes from '../../routes/customerRoutes';
import whatsappRoutes from '../../routes/whatsappRoutes';
import whatsappWebhookRoutes from '../../routes/whatsappWebhookRoutes';

const router = Router();

router.use('/', marketingRoutes);
router.use('/campaigns', campaignRoutes);
router.use('/customers', customerRoutes);
router.use('/whatsapp', whatsappRoutes);
router.use('/whatsapp-webhooks', whatsappWebhookRoutes);

export default router;
