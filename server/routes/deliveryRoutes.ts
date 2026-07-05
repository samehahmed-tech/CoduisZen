import { Router } from 'express';
import * as deliveryController from '../controllers/deliveryController';
import { requireRoles } from '../middleware/auth';
import { enforceBranch } from '../middleware/branchIsolation';

const router = Router();

const managerAuth = requireRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'CALL_CENTER_MANAGER');
const driverAuth = requireRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'CALL_CENTER_MANAGER', 'DRIVER');

router.get('/zones', enforceBranch, deliveryController.getAllZones);
router.post('/zones', managerAuth, enforceBranch, deliveryController.createZone);
router.put('/zones/:id', managerAuth, enforceBranch, deliveryController.updateZone);
router.delete('/zones/:id', requireRoles('SUPER_ADMIN', 'OWNER'), enforceBranch, deliveryController.deleteZone);

router.get('/drivers/all', enforceBranch, deliveryController.getDrivers);
router.post('/drivers', managerAuth, enforceBranch, deliveryController.createDriver);
router.put('/drivers/:id', managerAuth, enforceBranch, deliveryController.updateDriver);
router.get('/drivers', enforceBranch, deliveryController.getAvailableDrivers);
router.get('/telemetry', enforceBranch, deliveryController.getDriverTelemetry);
router.get('/sla-alerts', enforceBranch, deliveryController.getSlaAlerts);
router.put('/drivers/:id/status', driverAuth, enforceBranch, deliveryController.updateDriverStatus);
router.put('/drivers/:id/location', driverAuth, enforceBranch, deliveryController.updateDriverLocation);
router.post('/assign', managerAuth, enforceBranch, deliveryController.assignDriver);
router.post('/sla-alerts/escalate', managerAuth, enforceBranch, deliveryController.autoEscalateSlaAlerts);

export default router;
