import { Router } from 'express';
import {
    getAuditLogs,
    createAuditLog,
    verifyAuditLog,
    verifyAllAuditLogs,
    scanForTampering,
    forensicSearch
} from '../controllers/auditController';
import { authenticateToken, requirePermission } from '../middleware/auth';
import { scopeBranchQuery } from '../middleware/branchIsolation';

const router = Router();

// Audit data is sensitive. Every read, verification, and client-facing write
// must be authenticated and branch-scoped (cross-branch roles are handled by
// scopeBranchQuery according to the central branch policy).
router.use(authenticateToken, requirePermission('DATA_VIEW_AUDIT_LOGS'), scopeBranchQuery);

router.get('/', getAuditLogs);
router.get('/forensic', forensicSearch);
router.post('/', createAuditLog);
router.post('/verify-all', verifyAllAuditLogs);
router.post('/scan-tamper', scanForTampering);
router.post('/:id/verify', verifyAuditLog);

export default router;
