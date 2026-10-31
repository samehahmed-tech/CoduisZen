import { Router } from 'express';
import { requireRoleOrPermission } from '../middleware/auth';
import * as franchiseController from '../controllers/franchiseController';

const router = Router();
const headOfficeAuth = requireRoleOrPermission(['SUPER_ADMIN', 'OWNER', 'CEO', 'COO', 'GENERAL_MANAGER']);

router.get('/royalties/preview', headOfficeAuth, franchiseController.previewRoyalties);
router.post('/royalties/post', headOfficeAuth, franchiseController.postRoyalties);

export default router;
