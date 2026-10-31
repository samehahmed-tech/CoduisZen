import { Router } from 'express';
import { validate } from '../middleware/validate';
import { createMenuItemSchema, updateMenuItemSchema } from '../middleware/validation';
import * as menuController from '../controllers/menuController';
import { requireRoleOrPermission } from '../middleware/auth';
import { scopeBranchQuery } from '../middleware/branchIsolation';

const router = Router();
// Menu mutations additionally honor an explicit CFG_EDIT_MENU_PRICING grant
// (the same permission the AI action guard and editor UIs check).
// OWNER was missing here entirely (an owner could not edit the menu).
const managerAuth = requireRoleOrPermission(
    ['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'MANAGER'],
    ['CFG_EDIT_MENU_PRICING'],
);
const headOfficeAuth = requireRoleOrPermission(
    ['SUPER_ADMIN', 'OWNER', 'CEO', 'COO', 'GENERAL_MANAGER'],
    [],
);

router.get('/categories', menuController.getAllCategories);
router.post('/categories', managerAuth, menuController.createCategory);
router.put('/categories/:id', managerAuth, menuController.updateCategory);
router.delete('/categories/:id', managerAuth, menuController.deleteCategory);

router.get('/items', scopeBranchQuery, menuController.getMenuItems);
router.get('/items/pending', managerAuth, menuController.getPendingItems);
router.get('/items/export', managerAuth, scopeBranchQuery, menuController.exportItemsCSV);
router.post('/items/import', managerAuth, menuController.importItemsCSV);
router.post('/items', managerAuth, validate(createMenuItemSchema), menuController.createItem);
router.put('/items/:id', managerAuth, validate(updateMenuItemSchema), menuController.updateItem);
router.delete('/items/:id', managerAuth, menuController.deleteItem);

// Lifecycle workflow
router.post('/items/:id/approve', managerAuth, menuController.approveItem);
router.post('/items/:id/publish', managerAuth, menuController.publishItem);
router.post('/items/:id/request-price-change', managerAuth, menuController.requestPriceChange);
router.post('/items/:id/approve-price', managerAuth, menuController.approvePriceChange);
router.post('/branch-pricing/copy/preview', managerAuth, menuController.previewBranchPricingCopy);
router.post('/branch-pricing/copy', managerAuth, menuController.copyBranchPricing);
router.post('/master-data/distribution/preview', headOfficeAuth, menuController.previewMasterDataDistribution);
router.post('/master-data/distribution/request', headOfficeAuth, menuController.requestMasterDataDistribution);
router.get('/master-data/distribution/approvals', headOfficeAuth, menuController.getMasterDataDistributionApprovals);
router.post('/master-data/distribution/:approvalId/approve', headOfficeAuth, menuController.approveMasterDataDistribution);
router.post('/master-data/distribution/:approvalId/reject', headOfficeAuth, menuController.rejectMasterDataDistribution);
router.post('/master-data/distribution', headOfficeAuth, menuController.applyMasterDataDistribution);

router.get('/full', scopeBranchQuery, menuController.getFullMenu);

export default router;
