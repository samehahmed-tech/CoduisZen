import { Router } from 'express';
import { csvMigrationService } from '../services/csvMigrationService';
import { authenticateToken, requireRoles } from '../middleware/auth';
import { enforceBranch } from '../middleware/branchIsolation';
import { createSignedAuditLog } from '../services/auditService';
import { refundService } from '../services/refundService';

const router = Router();
router.use(authenticateToken, requireRoles('SUPER_ADMIN', 'OWNER', 'HR_MANAGER'), enforceBranch);

router.post('/refunds/projection/repair', async (req, res, next) => {
   try {
       const result = await refundService.repairProjection({
           branchId: req.effectiveBranchId || (req.body?.branchId ? String(req.body.branchId) : undefined),
           dryRun: req.body?.dryRun !== false,
       });
       await createSignedAuditLog({
           eventType: 'REFUND_PROJECTION_REPAIR',
           userId: req.user?.id || 'system',
           userRole: req.user?.role,
           branchId: req.effectiveBranchId,
           requestId: req.requestId,
           sourceDevice: req.headers['user-agent'],
           payload: { ...result, failed: result.failed.length },
           after: { completed: result.failed.length === 0, dryRun: result.dryRun },
           reason: result.dryRun ? 'Refund projection repair preview' : 'Refund projection repair executed',
       });
       return res.json(result);
   } catch (err) {
       return next(err);
   }
});

router.post('/:entity/upload', async (req, res, next) => {
   try {
       const branchId = String(req.effectiveBranchId || req.query.branchId || '').trim();
       const entity = req.params.entity; // 'users', 'attendance'
       
       // Because this is a lightweight API, we assume the CSV content is posted as text/plain body,
       // or a base64 encoded string if it's large. For simplicity, we read raw body:
       const csvContent = req.body;

       if (!branchId) return res.status(400).json({ error: 'BRANCH_ID_REQUIRED' });

       if (!csvContent || typeof csvContent !== 'string') {
           return res.status(400).json({ error: 'Missing raw CSV text body' });
       }

       if (entity === 'users') {
           const result = await csvMigrationService.importUsers(branchId, csvContent);
           await createSignedAuditLog({ eventType: 'CSV_USERS_IMPORTED', userId: req.user?.id || 'system', userRole: req.user?.role, branchId, requestId: req.requestId, sourceDevice: req.headers['user-agent'], payload: { branchId, contentLength: csvContent.length, imported: result.imported }, after: { completed: true }, reason: 'User CSV imported without recording raw CSV or credentials' });
           return res.json(result);
       } else if (entity === 'attendance') {
           const result = await csvMigrationService.importAttendance(branchId, csvContent);
           await createSignedAuditLog({ eventType: 'CSV_ATTENDANCE_IMPORTED', userId: req.user?.id || 'system', userRole: req.user?.role, branchId, requestId: req.requestId, sourceDevice: req.headers['user-agent'], payload: { branchId, contentLength: csvContent.length, imported: result.imported, failed: result.failed }, after: { completed: true }, reason: 'Attendance CSV imported without recording raw CSV' });
           return res.json(result);
       } else {
           return res.status(400).json({ error: 'Unsupported migration entity' });
       }
   } catch (err) {
       next(err);
   }
});

export default router;
