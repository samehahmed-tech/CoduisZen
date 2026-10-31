import { Router } from 'express';
import * as admin from '../controllers/talabatAdminController';
import { requireRoleOrPermission, requireRoles } from '../middleware/auth';
import { scopeBranchQuery } from '../middleware/branchIsolation';

const router = Router();

const talabatAdmin = requireRoleOrPermission(
    ['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER'],
    ['CFG_MANAGE_PLATFORMS'],
);
const talabatConfigAdmin = requireRoles('SUPER_ADMIN', 'OWNER');

router.use(talabatAdmin, scopeBranchQuery);

router.get('/config', talabatConfigAdmin, admin.getConfig);
router.put('/config', talabatConfigAdmin, admin.updateConfig);
router.get('/orders', admin.getHistory);
router.get('/orders/:talabatOrderId', admin.fetchRemoteOrder);
router.post('/orders/:orderId/sync', admin.syncOrder);
router.post('/test-order', admin.injectTestOrder);

// Catalog (price/availability) — PUT …/catalog is async (202 + job_id)
router.get('/catalog/preview', admin.catalogPreview);
router.post('/catalog/push', admin.catalogPush);
router.get('/catalog/jobs/:jobId', admin.catalogJobStatus);
router.get('/vendors/:vendorId/catalog', admin.vendorCatalog);
router.get('/vendors/:vendorId/categories', admin.vendorCategories);

// Outlet (open/closed/busy) — production only per spec
router.get('/vendors/:vendorId/status', admin.outletStatus);
router.put('/vendors/:vendorId/status', admin.outletUpdate);

// Promotions (strikethrough upsert) — production only per spec
router.post('/promotions/preview', admin.promotionPreview);
router.post('/promotions/push', admin.promotionPush);
router.get('/promotions/jobs/:jobId', admin.promotionJobStatus);

export default router;
