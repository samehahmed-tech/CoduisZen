import { Router } from 'express';
import * as printerController from '../controllers/printerController';
import { requireRoles } from '../middleware/auth';

const router = Router();

router.get('/', printerController.getPrinters);
router.get('/:id', printerController.getPrinterById);
router.post('/', requireRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER'), printerController.createPrinter);
router.put('/:id', requireRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER'), printerController.updatePrinter);
router.post('/:id/heartbeat', printerController.heartbeatPrinter); // Open for print bridge service
router.delete('/:id', requireRoles('SUPER_ADMIN', 'OWNER'), printerController.deletePrinter);

export default router;
