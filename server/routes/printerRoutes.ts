import { Router } from 'express';
import * as printerController from '../controllers/printerController';
import { requireRoles, requireRoleOrPermission } from '../middleware/auth';

const router = Router();

const printerAdmin = requireRoleOrPermission(
    ['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER'],
    ['CFG_MANAGE_PRINTERS'],
);

router.get('/', printerController.getPrinters);
router.get('/:id', printerController.getPrinterById);
router.post('/', printerAdmin, printerController.createPrinter);
router.put('/:id', printerAdmin, printerController.updatePrinter);
router.post('/:id/heartbeat', printerController.heartbeatPrinter); // Open for print bridge service
router.delete('/:id', requireRoles('SUPER_ADMIN', 'OWNER'), printerController.deletePrinter);

export default router;
