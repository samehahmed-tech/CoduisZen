import { Router } from 'express';
import * as admin from '../controllers/aggregatorAdminController';
import { requireRoleOrPermission } from '../middleware/auth';

const router = Router();

const aggregatorAdmin = requireRoleOrPermission(
    ['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER'],
    ['CFG_MANAGE_PLATFORMS'],
);

router.get('/providers', aggregatorAdmin, admin.listProviders);
router.put('/providers/:providerId', aggregatorAdmin, admin.updateProvider);
router.get('/providers/:providerId/orders', aggregatorAdmin, admin.providerHistory);
router.post('/providers/:providerId/test-order', aggregatorAdmin, admin.injectTestOrder);

export default router;
