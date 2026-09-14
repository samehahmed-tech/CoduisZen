import { Router } from 'express';
import * as settingsController from '../controllers/settingsController';
import { requireRoles } from '../middleware/auth';

const router = Router();

router.get('/', settingsController.getAllSettings);
router.put('/', requireRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER'), settingsController.updateBulkSettings);
router.put('/:key', requireRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER'), settingsController.updateSetting);

export default router;
