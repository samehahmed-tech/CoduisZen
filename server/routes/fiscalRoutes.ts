import { Router } from 'express';
import {
    getFiscalLogs,
    submitReceipt,
    getFiscalConfig,
    getFiscalReadiness,
    getFiscalSummary,
    getDeadLetters,
    retryDeadLetter,
    dismissDeadLetter,
} from '../controllers/fiscalController';
import { enforceBranch } from '../middleware/branchIsolation';
import { requireRoleOrPermission } from '../middleware/auth';
import { POS_FLOOR_ROLES } from '../utils/operationalRoles';

const router = Router();

const fiscalRead = requireRoleOrPermission(
    ['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'ACCOUNTANT', 'FINANCE_DIRECTOR', 'COST_ACCOUNTANT', 'TREASURY_OFFICER'],
    ['OP_MANAGE_FINANCE', 'DATA_VIEW_FINANCE'],
);
const fiscalSubmit = requireRoleOrPermission(
    [...POS_FLOOR_ROLES, 'ACCOUNTANT', 'FINANCE_DIRECTOR'],
    ['OP_PLACE_ORDER', 'OP_MANAGE_FINANCE'],
);
const fiscalDeadLetterManage = requireRoleOrPermission(
    ['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'ACCOUNTANT', 'FINANCE_DIRECTOR', 'COST_ACCOUNTANT'],
    ['OP_MANAGE_FINANCE'],
);

router.post('/submit', fiscalSubmit, enforceBranch, submitReceipt);
router.get('/logs', fiscalRead, enforceBranch, getFiscalLogs);
router.get('/summary', fiscalRead, enforceBranch, getFiscalSummary);
router.get('/dead-letters', fiscalDeadLetterManage, enforceBranch, getDeadLetters);
router.post('/dead-letters/:id/retry', fiscalDeadLetterManage, enforceBranch, retryDeadLetter);
router.post('/dead-letters/:id/dismiss', fiscalDeadLetterManage, enforceBranch, dismissDeadLetter);
router.get('/config', fiscalRead, enforceBranch, getFiscalConfig);
router.get('/readiness', fiscalRead, enforceBranch, getFiscalReadiness);

export default router;
