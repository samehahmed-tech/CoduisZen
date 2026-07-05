import { Router } from 'express';
import { waitlistController } from '../controllers/waitlistController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.use(authenticateToken);

router.get('/', waitlistController.getWaitlist);
router.post('/', waitlistController.addToWaitlist);
router.put('/:id', waitlistController.updateWaitlistStatus);

export default router;
