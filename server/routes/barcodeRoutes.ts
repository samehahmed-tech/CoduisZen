import { Router } from 'express';
import {
    unifiedBarcodeLookup,
    checkBarcodeExists,
    generateBarcode,
    lookupMenuItemByBarcode,
    lookupInventoryItemByBarcode,
} from '../controllers/barcodeLookupController';
import { requireRoles } from '../middleware/auth';
import { POS_FLOOR_ROLES } from '../utils/operationalRoles';

const router = Router();
const posAuth = requireRoles(...POS_FLOOR_ROLES);
const managerAuth = requireRoles('SUPER_ADMIN', 'BRANCH_MANAGER', 'MANAGER');

// Unified barcode lookup (used by POS scanner)
router.get('/lookup/:code', posAuth, unifiedBarcodeLookup);

// Duplicate check (used when registering barcodes)
router.get('/check/:code', managerAuth, checkBarcodeExists);

// Generate random EAN-13 barcode
router.get('/generate', managerAuth, generateBarcode);

// Type-specific lookups
router.get('/menu/:code', posAuth, lookupMenuItemByBarcode);
router.get('/inventory/:code', posAuth, lookupInventoryItemByBarcode);

export default router;
