import { Router } from 'express';
import { requireRoleOrPermission } from '../middleware/auth';
import * as controller from '../controllers/dataGovernanceController';

const router = Router();
// Data governance is tenant-wide: a branch manager must never be able to
// export another branch or alter retention/legal-hold policy via a generic
// settings permission.
const governanceAdmin = requireRoleOrPermission(['SUPER_ADMIN', 'OWNER', 'CEO', 'COO', 'GENERAL_MANAGER']);

router.get('/retention', governanceAdmin, controller.getRetentionPolicy);
router.get('/retention/plan', governanceAdmin, controller.getRetentionPlan);
router.put('/retention', governanceAdmin, controller.updateRetentionPolicy);
router.get('/branch-export', governanceAdmin, controller.exportBranchData);
router.get('/legal-holds', governanceAdmin, controller.listLegalHolds);
router.post('/legal-holds', governanceAdmin, controller.createLegalHold);
router.post('/legal-holds/:id/release', governanceAdmin, controller.releaseLegalHold);

export default router;
