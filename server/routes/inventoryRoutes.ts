import { Router } from 'express';
import {
    deleteInventoryItem,
    updateStock,
    transferStock,
    createStockTransferRequest,
    getStockTransferRequests,
    approveStockTransferRequest,
    dispatchStockTransferRequest,
    receiveStockTransferRequest,
    cancelStockTransferRequest,
    getTransferMovements,
    getRecipeConsumption,
    getMenuAvailability,
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
const ccAuth = requireRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'MANAGER', 'CASHIER', 'WAITER', 'CALL_CENTER', 'CALL_CENTER_MANAGER');

router.get('/menu-availability', ccAuth, enforceBranch, getMenuAvailability);

router.post('/stock/update', posAuth, enforceBranch, validate(stockUpdateSchema), updateStock);
router.post('/stock/receive', managerAuth, enforceBranch, validate(directStockReceiptSchema), receiveStockDirect);
router.post('/stock/transfer', managerAuth, enforceBranch, validate(stockTransferSchema), transferStock);
router.post('/stock/zero', ownerAuth, enforceBranch, zeroInventoryQuantities);
router.get('/stock/transfers', managerAuth, enforceBranch, getTransferMovements);
router.get('/stock/transfer-requests', managerAuth, enforceBranch, getStockTransferRequests);
router.post('/stock/transfer-requests', managerAuth, enforceBranch, createStockTransferRequest);
router.post('/stock/transfer-requests/:id/approve', managerAuth, enforceBranch, approveStockTransferRequest);
router.post('/stock/transfer-requests/:id/dispatch', managerAuth, enforceBranch, dispatchStockTransferRequest);
router.post('/stock/transfer-requests/:id/receive', managerAuth, enforceBranch, receiveStockTransferRequest);
router.post('/stock/transfer-requests/:id/cancel', managerAuth, enforceBranch, cancelStockTransferRequest);
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

router.get('/', posAuth, enforceBranch, getInventoryItems);
router.post('/', managerAuth, enforceBranch, createInventoryItem);
router.put('/:id', managerAuth, enforceBranch, updateInventoryItem);
router.delete('/:id', managerAuth, enforceBranch, deleteInventoryItem);

export default router;
