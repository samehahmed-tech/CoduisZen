import { Router } from 'express';
import * as platformsController from '../controllers/platformsController';
import { requireRoles } from '../middleware/auth';

const router = Router();

router.get('/', platformsController.getPlatforms);
router.post('/', requireRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER'), platformsController.createPlatform);
router.put('/:id', requireRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER'), platformsController.updatePlatform);
router.delete('/:id', requireRoles('SUPER_ADMIN', 'OWNER'), platformsController.deletePlatform);

export default router;
