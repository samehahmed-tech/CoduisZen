import { Router } from 'express';
import { requireRoles } from '../middleware/auth';
import { enqueueJob, listJobs, retryJob, cancelJob, purgeJobs } from '../controllers/printGatewayController';

const router = Router();

router.post('/jobs', requireRoles('SUPER_ADMIN', 'BRANCH_MANAGER', 'MANAGER', 'CASHIER', 'CALL_CENTER_AGENT'), enqueueJob);
router.get('/jobs', requireRoles('SUPER_ADMIN', 'BRANCH_MANAGER', 'MANAGER'), listJobs);
router.delete('/jobs/purge', requireRoles('SUPER_ADMIN', 'BRANCH_MANAGER', 'MANAGER'), purgeJobs);
router.post('/jobs/:jobId/retry', requireRoles('SUPER_ADMIN', 'BRANCH_MANAGER', 'MANAGER'), retryJob);
router.delete('/jobs/:jobId', requireRoles('SUPER_ADMIN', 'BRANCH_MANAGER', 'MANAGER'), cancelJob);

export default router;
