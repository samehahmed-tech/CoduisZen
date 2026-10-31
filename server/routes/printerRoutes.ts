import { Router } from 'express';
import * as printerController from '../controllers/printerController';
import { requireRoles, requireRoleOrPermission } from '../middleware/auth';
import { enforceBranch } from '../middleware/branchIsolation';

const router = Router();

const printerAdmin = requireRoleOrPermission(
    ['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER'],
    ['CFG_MANAGE_PRINTERS'],
);

router.get('/', enforceBranch, printerController.getPrinters);
router.get('/:id', enforceBranch, printerController.getPrinterById);
router.post('/', printerAdmin, enforceBranch, printerController.createPrinter);
router.put('/:id', printerAdmin, enforceBranch, printerController.updatePrinter);
router.post('/:id/heartbeat', printerController.heartbeatPrinter); // Open for print bridge service
router.delete('/:id', requireRoles('SUPER_ADMIN', 'OWNER'), enforceBranch, printerController.deletePrinter);

export default router;
