import { Router } from 'express';
import { requireRoles } from '../middleware/auth';
import { createKey, listKeys, revokeKey, rotateKey } from '../controllers/publicApiKeyController';

const router = Router();
// Public API keys can delegate access to multiple branches, so creation and
// rotation are tenant-wide security administration rather than branch config.
const managePublicApiKeys = requireRoles('SUPER_ADMIN', 'OWNER', 'CEO', 'COO', 'GENERAL_MANAGER', 'IT');

router.use(managePublicApiKeys);
router.get('/keys', listKeys);
router.post('/keys', createKey);
router.post('/keys/:id/revoke', revokeKey);
router.post('/keys/:id/rotate', rotateKey);

export default router;
