import { Router } from 'express';
import * as supplierController from '../controllers/supplierController';
import { requireRoles } from '../middleware/auth';

const router = Router();

router.get('/', supplierController.getSuppliers);
router.get('/:id', supplierController.getSupplierById);
router.post('/', requireRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'PROCUREMENT_MANAGER'), supplierController.createSupplier);
router.put('/:id', requireRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'PROCUREMENT_MANAGER'), supplierController.updateSupplier);
router.delete('/:id', requireRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER'), supplierController.deactivateSupplier);

export default router;
