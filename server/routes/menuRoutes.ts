import { Router } from 'express';
import { validate } from '../middleware/validate';
import { createMenuItemSchema, updateMenuItemSchema } from '../middleware/validation';
import * as menuController from '../controllers/menuController';
import { requireRoles } from '../middleware/auth';

const router = Router();
const managerAuth = requireRoles('SUPER_ADMIN', 'BRANCH_MANAGER', 'MANAGER');

router.get('/categories', menuController.getAllCategories);
router.post('/categories', managerAuth, menuController.createCategory);
router.put('/categories/:id', managerAuth, menuController.updateCategory);
router.delete('/categories/:id', managerAuth, menuController.deleteCategory);

router.get('/items', menuController.getMenuItems);
router.get('/items/pending', managerAuth, menuController.getPendingItems);
router.get('/items/export', managerAuth, menuController.exportItemsCSV);
router.post('/items/import', managerAuth, menuController.importItemsCSV);
router.post('/items', managerAuth, validate(createMenuItemSchema), menuController.createItem);
router.put('/items/:id', managerAuth, validate(updateMenuItemSchema), menuController.updateItem);
router.delete('/items/:id', managerAuth, menuController.deleteItem);

// Lifecycle workflow
router.post('/items/:id/approve', managerAuth, menuController.approveItem);
router.post('/items/:id/publish', managerAuth, menuController.publishItem);
router.post('/items/:id/request-price-change', managerAuth, menuController.requestPriceChange);
router.post('/items/:id/approve-price', managerAuth, menuController.approvePriceChange);

router.get('/full', menuController.getFullMenu);

export default router;
