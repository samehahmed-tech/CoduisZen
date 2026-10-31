import { Router } from 'express';
import * as supplierController from '../controllers/supplierController';
import { requireRoles, requireRoleOrPermission } from '../middleware/auth';
import { enforceBranch } from '../middleware/branchIsolation';

const router = Router();

const procurementAuth = requireRoleOrPermission(
    ['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'PROCUREMENT_MANAGER'],
    ['OP_CREATE_PO'],
);

router.get('/', enforceBranch, supplierController.getSuppliers);
router.get('/:id', enforceBranch, supplierController.getSupplierById);
router.post('/', procurementAuth, enforceBranch, supplierController.createSupplier);
router.put('/:id', procurementAuth, enforceBranch, supplierController.updateSupplier);
router.delete('/:id', procurementAuth, enforceBranch, supplierController.deactivateSupplier);

export default router;
