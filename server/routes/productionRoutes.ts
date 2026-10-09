import { Router } from 'express';
import * as productionController from '../controllers/productionController';
import { requireRoles, requireRoleOrPermission } from '../middleware/auth';
import { enforceBranch } from '../middleware/branchIsolation';

const router = Router();

const productionAuth = requireRoleOrPermission(
    ['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'PRODUCTION_STAFF'],
    ['OP_MANAGE_PRODUCTION'],
);
const productionManage = requireRoleOrPermission(
    ['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER'],
    ['OP_MANAGE_PRODUCTION'],
);

router.get('/orders', productionAuth, enforceBranch, productionController.getProductionOrders);
router.post('/orders', productionAuth, enforceBranch, productionController.createProductionOrder);
router.get('/orders/:id', productionAuth, enforceBranch, productionController.getProductionOrderById);
router.put('/orders/:id', productionManage, enforceBranch, productionController.updateProductionOrder);
router.delete('/orders/:id', productionManage, enforceBranch, productionController.deleteProductionOrder);
router.put('/orders/:id/start', productionAuth, enforceBranch, productionController.startProductionOrder);
router.put('/orders/:id/complete', productionAuth, enforceBranch, productionController.completeProductionOrder);
router.put('/orders/:id/cancel', productionManage, enforceBranch, productionController.cancelProductionOrder);

export default router;
