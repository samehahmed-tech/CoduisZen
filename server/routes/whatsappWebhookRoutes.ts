import { Router } from 'express';
import { receiveWhatsAppWebhook, verifyWhatsAppWebhook } from '../controllers/whatsappController';
import { requireWhatsAppWebhookAuth } from '../middleware/whatsappWebhookAuth';

const router = Router();

router.get('/webhook', verifyWhatsAppWebhook);
router.post('/webhook', requireWhatsAppWebhookAuth, receiveWhatsAppWebhook);

export default router;
