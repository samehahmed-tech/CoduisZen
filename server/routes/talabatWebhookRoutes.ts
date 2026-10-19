import { Router } from 'express';
import { receiveTalabatWebhook } from '../controllers/talabatWebhookController';
import { requireTalabatWebhookAuth } from '../modules/talabat/talabatWebhookAuth';

const router = Router();

// Public — auth is the Talabat-shared secret, not the user JWT.
router.post('/webhook', requireTalabatWebhookAuth, receiveTalabatWebhook);

export default router;
