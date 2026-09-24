import { Router } from 'express';
import * as customerController from '../controllers/customerController';
import { requireRoles } from '../middleware/auth';
import { enforceBranch } from '../middleware/branchIsolation';
import { POS_FLOOR_ROLES } from '../utils/operationalRoles';

const router = Router();
const posAuth = requireRoles(...POS_FLOOR_ROLES, 'CALL_CENTER', 'CALL_CENTER_MANAGER');

router.get('/', posAuth, enforceBranch, customerController.getAllCustomers);
router.get('/phone/:phone', posAuth, enforceBranch, customerController.getCustomerByPhone);
router.get('/:id', posAuth, enforceBranch, customerController.getCustomerById);
router.post('/', posAuth, enforceBranch, customerController.createCustomer);
router.put('/:id', posAuth, enforceBranch, customerController.updateCustomer);
router.delete('/:id', posAuth, enforceBranch, customerController.deleteCustomer);

// Loyalty endpoints
router.post('/:id/redeem-points', posAuth, enforceBranch, customerController.redeemLoyaltyPoints);

// Saved delivery addresses (call-center profile)
router.post('/:id/addresses', posAuth, enforceBranch, customerController.addCustomerAddress);

export default router;
