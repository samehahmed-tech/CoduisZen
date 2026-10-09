import { Router } from 'express';
import * as hrController from '../controllers/hrController';
import { requireRoles, requireRoleOrPermission } from '../middleware/auth';
import { enforceBranch } from '../middleware/branchIsolation';

const router = Router();
// Payroll execution additionally honors an explicit OP_PROCESS_PAYROLL grant.
const hrAuth = requireRoleOrPermission(
    ['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'HR_MANAGER', 'PAYROLL_OFFICER', 'MANAGER'],
    ['OP_PROCESS_PAYROLL'],
);

router.get('/employees', hrAuth, enforceBranch, hrController.getEmployees);
router.post('/employees', hrAuth, enforceBranch, hrController.upsertEmployee);
router.delete('/employees/:id', requireRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'HR_MANAGER'), enforceBranch, hrController.deleteEmployee);
router.get('/attendance', hrAuth, enforceBranch, hrController.getAttendance);
router.post('/attendance/clock-in', hrAuth, enforceBranch, hrController.clockIn);
router.post('/attendance/clock-out', hrAuth, enforceBranch, hrController.clockOut);
router.get('/payroll/summary', hrAuth, enforceBranch, hrController.payrollSummary);
router.get('/payroll/cycles', hrAuth, enforceBranch, hrController.getPayrollCycles);
router.get('/payroll/payouts', hrAuth, enforceBranch, hrController.getPayoutLedger);
router.post('/payroll/execute', hrAuth, enforceBranch, hrController.executePayrollCycle);

export default router;
