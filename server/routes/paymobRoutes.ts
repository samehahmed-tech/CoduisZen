import { Router } from 'express';
import * as paymob from '../controllers/paymobController';
import { requireRoleOrPermission } from '../middleware/auth';
import { POS_FLOOR_ROLES } from '../utils/operationalRoles';

const router = Router();

const financeAdmin = requireRoleOrPermission(
    ['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'ACCOUNTANT', 'FINANCE_DIRECTOR'],
    ['OP_MANAGE_FINANCE'],
);

const posAccess = requireRoleOrPermission(
    [...POS_FLOOR_ROLES, 'CALL_CENTER', 'CALL_CENTER_MANAGER'],
    ['OP_PLACE_ORDER'],
);

router.get('/config', financeAdmin, paymob.getConfig);
router.put('/config', financeAdmin, paymob.updateConfig);
router.post('/intention', posAccess, paymob.createCheckout);
router.post('/refund', financeAdmin, paymob.refund);
// NOTE: POST /webhook is mounted publicly in app.ts (HMAC auth, no JWT).

export default router;
