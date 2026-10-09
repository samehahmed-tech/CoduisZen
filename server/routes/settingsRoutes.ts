import { Router } from 'express';
import * as settingsController from '../controllers/settingsController';
import { requireRoleOrPermission } from '../middleware/auth';

const router = Router();

const settingsAdmin = requireRoleOrPermission(
    ['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER'],
    ['CFG_MANAGE_SETTINGS'],
);

router.get('/', settingsController.getAllSettings);
router.put('/', settingsAdmin, settingsController.updateBulkSettings);
router.put('/:key', settingsAdmin, settingsController.updateSetting);

export default router;
