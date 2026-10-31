import { Router } from 'express';
import * as platformsController from '../controllers/platformsController';
import { requireRoles, requireRoleOrPermission } from '../middleware/auth';

const router = Router();

const platformAdmin = requireRoleOrPermission(
    ['SUPER_ADMIN', 'OWNER'],
    ['CFG_MANAGE_PLATFORMS'],
);

router.get('/', platformsController.getPlatforms);
router.post('/', platformAdmin, platformsController.createPlatform);
router.put('/:id', platformAdmin, platformsController.updatePlatform);
router.delete('/:id', requireRoles('SUPER_ADMIN', 'OWNER'), platformsController.deletePlatform);

export default router;
