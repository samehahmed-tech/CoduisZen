import { Router } from 'express';
import { receiveAggregatorWebhook } from '../controllers/aggregatorWebhookController';
import { requireAggregatorWebhookAuth } from '../modules/aggregators/aggregatorWebhookAuth';

const router = Router();

// Public — auth is the per-provider shared secret, not the user JWT.
router.post('/:providerId/webhook', requireAggregatorWebhookAuth, receiveAggregatorWebhook);

export default router;
