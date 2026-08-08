import { Router } from 'express';
import { kdsController } from '../controllers/kdsController';
import { authenticateToken } from '../middleware/auth';
import { enforceBranch } from '../middleware/branchIsolation';

const router = Router();

// Secure all KDS boundaries
router.use(authenticateToken);
router.use(enforceBranch);

router.get('/meta', kdsController.getMeta);
router.get('/', kdsController.getTickets);
router.post('/dispatch', kdsController.dispatchOrder);
router.post('/orders/:orderId/handover', kdsController.handoverOrder);
router.post('/:id/bump', kdsController.bumpTicket);
router.post('/:id/recall', kdsController.recallTicket);
router.put('/:id/items/:itemId/toggle', kdsController.toggleItem);

export default router;
