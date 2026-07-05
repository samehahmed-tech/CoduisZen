import { Router } from 'express';
import inventoryRoutes from '../../routes/inventoryRoutes';
import warehouseRoutes from '../../routes/warehouseRoutes';
import supplierRoutes from '../../routes/supplierRoutes';
import purchaseOrderRoutes from '../../routes/purchaseOrderRoutes';
import wastageRoutes from '../../routes/wastageRoutes';
import productionRoutes from '../../routes/productionRoutes';
import barcodeRoutes from '../../routes/barcodeRoutes';
import inventoryIntelligenceRoutes from '../../routes/inventoryIntelligenceRoutes';
import { requireRoles } from '../../middleware/auth';

const router = Router();

// Middleware can be applied here to the entire module
const inventoryAuth = requireRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'WAREHOUSE_DIRECTOR', 'PROCUREMENT_MANAGER');

router.use('/', inventoryRoutes);
router.use('/warehouses', warehouseRoutes);
router.use('/suppliers', supplierRoutes);
router.use('/purchase-orders', purchaseOrderRoutes);
router.use('/wastage', wastageRoutes);
router.use('/production', productionRoutes);
router.use('/barcode', barcodeRoutes);
router.use('/intelligence', inventoryIntelligenceRoutes);

export default router;
