import { Router } from 'express';
import { authenticateToken, requireRoles } from '../middleware/auth';
import * as deployment from '../controllers/deploymentController';

const router = Router();
const admin = requireRoles('SUPER_ADMIN', 'OWNER', 'IT');

router.get('/config', authenticateToken, admin, deployment.getConfig);
router.post('/pairing-token', authenticateToken, admin, deployment.issuePairingToken);
router.get('/sites', authenticateToken, admin, deployment.getRegisteredSites);
router.get('/update-release', authenticateToken, admin, deployment.getUpdateRelease);
router.put('/update-release', authenticateToken, admin, deployment.updateRelease);
router.post('/commands', authenticateToken, admin, deployment.queueCommand);
// Registration/heartbeat are protected by the one-time pairing token/site identity,
// because a newly installed branch has no user session yet.
router.post('/register', deployment.registerBranch);
router.post('/heartbeat', deployment.heartbeat);
router.post('/commands/pull', deployment.pullCommands);
router.post('/commands/ack', deployment.acknowledgeCommand);

export default router;
