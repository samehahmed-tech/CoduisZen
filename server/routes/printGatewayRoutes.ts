import { Router } from 'express';
import { authenticateToken, requireRoles } from '../middleware/auth.js';
import { enqueueJob, listJobs, retryJob, cancelJob, purgeJobs, bridgeConnect, completeJob, failJob, claimBridgeJob, getBridges } from '../controllers/printGatewayController.js';
import { requirePrintGatewayToken } from '../middleware/printGatewayAuth.js';

const router = Router();

// Bridge API — no auth, uses gatewayId as identification
router.get('/bridge/connect', requirePrintGatewayToken, bridgeConnect);
router.get('/bridge/jobs', requirePrintGatewayToken, (req, res, next) => {
    req.query.branchId = String(req.query.branchId || req.headers['x-branch-id'] || '').trim();
    req.query.gatewayId = String(req.query.gatewayId || req.headers['x-gateway-id'] || '').trim();
    return claimBridgeJob(req, res).catch(next);
});
router.post('/bridge/jobs/:jobId/complete', requirePrintGatewayToken, completeJob);
router.post('/bridge/jobs/:jobId/fail', requirePrintGatewayToken, failJob);

// Protected job management (for web UI)
router.get('/bridges', authenticateToken, requireRoles('SUPER_ADMIN', 'BRANCH_MANAGER', 'MANAGER'), getBridges);
router.use('/jobs', authenticateToken);
router.post('/jobs', requireRoles('SUPER_ADMIN', 'BRANCH_MANAGER', 'MANAGER', 'CASHIER', 'CALL_CENTER_AGENT'), enqueueJob);
router.get('/jobs', requireRoles('SUPER_ADMIN', 'BRANCH_MANAGER', 'MANAGER'), listJobs);
router.post('/jobs/:jobId/complete', requireRoles('SUPER_ADMIN', 'BRANCH_MANAGER', 'MANAGER', 'CASHIER'), completeJob);
router.post('/jobs/:jobId/fail', requireRoles('SUPER_ADMIN', 'BRANCH_MANAGER', 'MANAGER'), failJob);
router.post('/jobs/:jobId/retry', requireRoles('SUPER_ADMIN', 'BRANCH_MANAGER', 'MANAGER'), retryJob);
router.delete('/jobs/purge', requireRoles('SUPER_ADMIN', 'BRANCH_MANAGER', 'MANAGER'), purgeJobs);
router.delete('/jobs/:jobId', requireRoles('SUPER_ADMIN', 'BRANCH_MANAGER', 'MANAGER'), cancelJob);

export default router;
