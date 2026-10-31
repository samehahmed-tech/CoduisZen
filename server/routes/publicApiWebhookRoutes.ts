import { Router } from 'express';
import { authenticateManagedPublicApiKey, requirePublicApiScope } from '../services/publicApiKeyService';
import { createPublicWebhook, deletePublicWebhook, listPublicWebhookDeliveries, listPublicWebhooks } from '../controllers/publicApiWebhookController';

const router = Router();

router.get('/webhooks', authenticateManagedPublicApiKey, requirePublicApiScope('webhooks:read'), listPublicWebhooks);
router.post('/webhooks', authenticateManagedPublicApiKey, requirePublicApiScope('webhooks:manage'), createPublicWebhook);
router.delete('/webhooks/:id', authenticateManagedPublicApiKey, requirePublicApiScope('webhooks:manage'), deletePublicWebhook);
router.get('/webhooks/:id/deliveries', authenticateManagedPublicApiKey, requirePublicApiScope('webhooks:read'), listPublicWebhookDeliveries);

export default router;
