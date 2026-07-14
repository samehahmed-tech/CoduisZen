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

const router = Router();
router.use(enforceBranch);

router.post('/submit', submitReceipt);
router.get('/logs', getFiscalLogs);
router.get('/summary', getFiscalSummary);
router.get('/dead-letters', getDeadLetters);
router.post('/dead-letters/:id/retry', retryDeadLetter);
router.post('/dead-letters/:id/dismiss', dismissDeadLetter);
router.get('/config', getFiscalConfig);
router.get('/readiness', getFiscalReadiness);

export default router;
