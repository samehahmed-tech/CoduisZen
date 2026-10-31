import { Router } from 'express';
import * as settingsController from '../controllers/settingsController';
import { requireRoles } from '../middleware/auth';

const router = Router();

// `settings` is a global table, not a branch-scoped store. A branch manager
// must not be able to change tax, branding, or operational defaults for every
// branch merely by receiving a settings permission.
const settingsAdmin = requireRoles('SUPER_ADMIN', 'OWNER', 'CEO', 'COO', 'GENERAL_MANAGER');

router.get('/', settingsController.getAllSettings);
router.put('/', settingsAdmin, settingsController.updateBulkSettings);
router.put('/:key', settingsAdmin, settingsController.updateSetting);

export default router;
