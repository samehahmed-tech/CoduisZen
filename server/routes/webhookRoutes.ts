import { Router } from 'express';
import {
    getWebhooks,
    createWebhook,
    updateWebhook,
    deleteWebhook,
    getWebhookDeliveries,
} from '../controllers/webhookController';
import { enforceBranch } from '../middleware/branchIsolation';

const router = Router();

router.use(enforceBranch);

router.get('/', getWebhooks);
router.post('/', createWebhook);
router.put('/:id', updateWebhook);
router.delete('/:id', deleteWebhook);
router.get('/:id/deliveries', getWebhookDeliveries);

export default router;
