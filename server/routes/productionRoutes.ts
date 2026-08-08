import { Router } from 'express';
import * as productionController from '../controllers/productionController';
import { requireRoles } from '../middleware/auth';
import { enforceBranch } from '../middleware/branchIsolation';

const router = Router();

const productionAuth = requireRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'PRODUCTION_STAFF');

router.get('/orders', productionAuth, enforceBranch, productionController.getProductionOrders);
router.post('/orders', productionAuth, enforceBranch, productionController.createProductionOrder);
router.put('/orders/:id/start', productionAuth, enforceBranch, productionController.startProductionOrder);
router.put('/orders/:id/complete', productionAuth, enforceBranch, productionController.completeProductionOrder);
router.put('/orders/:id/cancel', requireRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER'), enforceBranch, productionController.cancelProductionOrder);

export default router;
