import { Router } from 'express';
import {
    deleteInventoryItem,
    updateStock,
    transferStock,
    getTransferMovements,
    getRecipeConsumption,
    getInventoryBatches,
    getInventoryItems,
    createInventoryItem,
    updateInventoryItem,
    receiveStockDirect,
    zeroInventoryQuantities,
} from '../controllers/inventoryController';
import { generateBarcodeLabels, previewBarcodeLabel } from '../controllers/barcodeLabelController';
import { validate } from '../middleware/validate';
import { directStockReceiptSchema, stockUpdateSchema, stockTransferSchema } from '../middleware/validation';
import { requireRoles } from '../middleware/auth';
import { enforceBranch } from '../middleware/branchIsolation';

const router = Router();
const posAuth = requireRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'MANAGER', 'WAREHOUSE_DIRECTOR', 'PROCUREMENT_MANAGER', 'CASHIER', 'WAITER');
const managerAuth = requireRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'MANAGER', 'WAREHOUSE_DIRECTOR', 'PROCUREMENT_MANAGER');
const ownerAuth = requireRoles('SUPER_ADMIN', 'OWNER');

router.post('/stock/update', posAuth, enforceBranch, validate(stockUpdateSchema), updateStock);
router.post('/stock/receive', managerAuth, enforceBranch, validate(directStockReceiptSchema), receiveStockDirect);
router.post('/stock/transfer', managerAuth, enforceBranch, validate(stockTransferSchema), transferStock);
router.post('/stock/zero', ownerAuth, enforceBranch, zeroInventoryQuantities);
router.get('/stock/transfers', managerAuth, enforceBranch, getTransferMovements);
router.get('/stock/recipe-consumption', managerAuth, enforceBranch, getRecipeConsumption);
router.get('/batches', managerAuth, enforceBranch, getInventoryBatches);

// Barcode Labels
router.post('/barcode-labels', managerAuth, generateBarcodeLabels);
router.get('/barcode-labels/preview/:id', managerAuth, previewBarcodeLabel);

// Cycle Counts must be registered before /:id routes.
import { createStockCount, freezeStockCount, getStockCount, getStockCounts, submitCount, postStockCount } from '../controllers/inventoryCountController';
router.get('/counts', managerAuth, enforceBranch, getStockCounts);
router.get('/counts/:id', managerAuth, enforceBranch, getStockCount);
router.post('/counts', managerAuth, enforceBranch, createStockCount);
router.post('/counts/:id/freeze', managerAuth, enforceBranch, freezeStockCount);
router.post('/counts/:id/submit', managerAuth, enforceBranch, submitCount);
router.post('/counts/:id/post', managerAuth, enforceBranch, postStockCount);

router.get('/', posAuth, getInventoryItems);
router.post('/', managerAuth, createInventoryItem);
router.put('/:id', managerAuth, updateInventoryItem);
router.delete('/:id', managerAuth, deleteInventoryItem);

export default router;
