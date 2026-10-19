import { Router } from 'express';
import * as admin from '../controllers/talabatAdminController';
import { requireRoleOrPermission } from '../middleware/auth';

const router = Router();

const talabatAdmin = requireRoleOrPermission(
    ['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER'],
    ['CFG_MANAGE_PLATFORMS'],
);

router.get('/config', talabatAdmin, admin.getConfig);
router.put('/config', talabatAdmin, admin.updateConfig);
router.get('/orders', talabatAdmin, admin.getHistory);
router.get('/orders/:talabatOrderId', talabatAdmin, admin.fetchRemoteOrder);
router.post('/orders/:orderId/sync', talabatAdmin, admin.syncOrder);
router.post('/test-order', talabatAdmin, admin.injectTestOrder);

// Catalog (price/availability) — PUT …/catalog is async (202 + job_id)
router.get('/catalog/preview', talabatAdmin, admin.catalogPreview);
router.post('/catalog/push', talabatAdmin, admin.catalogPush);
router.get('/catalog/jobs/:jobId', talabatAdmin, admin.catalogJobStatus);
router.get('/vendors/:vendorId/catalog', talabatAdmin, admin.vendorCatalog);
router.get('/vendors/:vendorId/categories', talabatAdmin, admin.vendorCategories);

// Outlet (open/closed/busy) — production only per spec
router.get('/vendors/:vendorId/status', talabatAdmin, admin.outletStatus);
router.put('/vendors/:vendorId/status', talabatAdmin, admin.outletUpdate);

// Promotions (strikethrough upsert) — production only per spec
router.post('/promotions/preview', talabatAdmin, admin.promotionPreview);
router.post('/promotions/push', talabatAdmin, admin.promotionPush);
router.get('/promotions/jobs/:jobId', talabatAdmin, admin.promotionJobStatus);

export default router;
