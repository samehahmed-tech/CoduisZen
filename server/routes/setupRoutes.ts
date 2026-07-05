import { Router } from 'express';
import { bootstrapSetup, getSetupStatus, resetTestData, seedCOA } from '../controllers/setupController';
import { authenticateToken, requireRoles } from '../middleware/auth';

const router = Router();

router.get('/status', getSetupStatus);
router.post('/bootstrap', bootstrapSetup);
router.post('/seed-coa', authenticateToken, requireRoles('SUPER_ADMIN'), seedCOA);
router.post('/reset-test-data', authenticateToken, requireRoles('SUPER_ADMIN'), resetTestData);

export default router;
