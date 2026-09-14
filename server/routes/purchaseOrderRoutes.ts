import { Router } from 'express';
import * as poController from '../controllers/purchaseOrderController';
import { requireRoleOrPermission } from '../middleware/auth';
import { enforceBranch } from '../middleware/branchIsolation';

const router = Router();
const readProcurement = requireRoleOrPermission(
    ['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'PROCUREMENT_MANAGER', 'WAREHOUSE_DIRECTOR', 'WAREHOUSE_STAFF', 'ACCOUNTANT', 'FINANCE_DIRECTOR'],
    ['NAV_INVENTORY', 'DATA_VIEW_COSTS', 'DATA_VIEW_STOCK_LEVELS', 'OP_CREATE_PO', 'OP_RECEIVE_GRN']
);
const createPO = requireRoleOrPermission(
    ['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'PROCUREMENT_MANAGER'],
    ['OP_CREATE_PO']
);
const receiveGRN = requireRoleOrPermission(
    ['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'PROCUREMENT_MANAGER', 'WAREHOUSE_DIRECTOR', 'WAREHOUSE_STAFF'],
    ['OP_RECEIVE_GRN']
);
const sendPO = requireRoleOrPermission(
    ['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'PROCUREMENT_MANAGER'],
    ['OP_CREATE_PO', 'OP_APPROVE_PO']
);
const approvePO = requireRoleOrPermission(
    ['SUPER_ADMIN', 'OWNER', 'PROCUREMENT_MANAGER', 'WAREHOUSE_DIRECTOR'],
    ['OP_APPROVE_PO']
);
const createSupplierInvoice = requireRoleOrPermission(
    ['SUPER_ADMIN', 'OWNER', 'PROCUREMENT_MANAGER', 'ACCOUNTANT', 'FINANCE_DIRECTOR'],
    ['OP_CREATE_SUPPLIER_INVOICE']
);
const approveSupplierInvoice = requireRoleOrPermission(
    ['SUPER_ADMIN', 'OWNER', 'PROCUREMENT_MANAGER', 'FINANCE_DIRECTOR'],
    ['OP_APPROVE_SUPPLIER_INVOICE']
);

import * as procController from '../controllers/procurementController';

// Procure-to-Pay (GRN and AP Bills)
router.get('/grn', readProcurement, enforceBranch, procController.getGRNs);
router.get('/invoices', readProcurement, enforceBranch, procController.getSupplierInvoices);
router.get('/', readProcurement, enforceBranch, poController.getPOs);
router.get('/:id', readProcurement, enforceBranch, poController.getPOById);
router.post('/', createPO, enforceBranch, poController.createPO);
router.put('/:id/receive', receiveGRN, enforceBranch, poController.receivePO);
router.put('/:id/status', sendPO, enforceBranch, poController.updatePOStatus);
router.post('/grn', receiveGRN, enforceBranch, procController.createGRN);
router.post('/returns', receiveGRN, enforceBranch, procController.createPurchaseReturn);
router.post('/invoices', createSupplierInvoice, enforceBranch, procController.createSupplierInvoice);
router.post('/invoices/:id/approve', approveSupplierInvoice, enforceBranch, procController.approveSupplierInvoice);

export default router;
