import { Router } from 'express';
import {
    getWebhooks,
    createWebhook,
    updateWebhook,
    deleteWebhook,
    getWebhookDeliveries,
} from '../controllers/webhookController';

const router = Router();

router.get('/', getWebhooks);
router.post('/', createWebhook);
router.put('/:id', updateWebhook);
router.delete('/:id', deleteWebhook);
router.get('/:id/deliveries', getWebhookDeliveries);

export default router;
