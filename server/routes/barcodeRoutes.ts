import { Router } from 'express';
import {
    unifiedBarcodeLookup,
    checkBarcodeExists,
    generateBarcode,
    lookupMenuItemByBarcode,
    lookupInventoryItemByBarcode,
} from '../controllers/barcodeLookupController';
import { requireRoles } from '../middleware/auth';
import { enforceBranch } from '../middleware/branchIsolation';
import { POS_FLOOR_ROLES } from '../utils/operationalRoles';

const router = Router();
const posAuth = requireRoles(...POS_FLOOR_ROLES);
const managerAuth = requireRoles('SUPER_ADMIN', 'BRANCH_MANAGER', 'MANAGER');

// Unified barcode lookup (used by POS scanner)
router.get('/lookup/:code', posAuth, enforceBranch, unifiedBarcodeLookup);

// Duplicate check (used when registering barcodes)
router.get('/check/:code', managerAuth, enforceBranch, checkBarcodeExists);

// Generate random EAN-13 barcode
router.get('/generate', managerAuth, generateBarcode);

// Type-specific lookups
router.get('/menu/:code', posAuth, enforceBranch, lookupMenuItemByBarcode);
router.get('/inventory/:code', posAuth, enforceBranch, lookupInventoryItemByBarcode);

export default router;
