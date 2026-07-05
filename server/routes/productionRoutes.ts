import { Router } from 'express';
import * as productionController from '../controllers/productionController';
import { requireRoles } from '../middleware/auth';

const router = Router();

const productionAuth = requireRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'PRODUCTION_STAFF');

router.get('/orders', productionController.getProductionOrders);
router.post('/orders', productionAuth, productionController.createProductionOrder);
router.put('/orders/:id/start', productionAuth, productionController.startProductionOrder);
router.put('/orders/:id/complete', productionAuth, productionController.completeProductionOrder);
router.put('/orders/:id/cancel', requireRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER'), productionController.cancelProductionOrder);

export default router;
