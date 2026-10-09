import { Router } from 'express';
import * as supplierController from '../controllers/supplierController';
import { requireRoles, requireRoleOrPermission } from '../middleware/auth';

const router = Router();

const procurementAuth = requireRoleOrPermission(
    ['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'PROCUREMENT_MANAGER'],
    ['OP_CREATE_PO'],
);

router.get('/', supplierController.getSuppliers);
router.get('/:id', supplierController.getSupplierById);
router.post('/', procurementAuth, supplierController.createSupplier);
router.put('/:id', procurementAuth, supplierController.updateSupplier);
router.delete('/:id', procurementAuth, supplierController.deactivateSupplier);

export default router;
