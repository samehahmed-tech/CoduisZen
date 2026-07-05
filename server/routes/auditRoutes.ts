import { Router } from 'express';
import {
    getAuditLogs,
    createAuditLog,
    verifyAuditLog,
    verifyAllAuditLogs,
    scanForTampering,
    forensicSearch
} from '../controllers/auditController';

const router = Router();

router.get('/', getAuditLogs);
router.get('/forensic', forensicSearch);
router.post('/', createAuditLog);
router.post('/verify-all', verifyAllAuditLogs);
router.post('/scan-tamper', scanForTampering);
router.post('/:id/verify', verifyAuditLog);

export default router;
