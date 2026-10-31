import { Router } from 'express';
import { uploadImage, getImage, deleteImage } from '../controllers/imageController';
import { authenticateToken, requireRoles } from '../middleware/auth';

const router = Router();
const imageAdmin = requireRoles('SUPER_ADMIN', 'OWNER', 'CEO', 'COO', 'GENERAL_MANAGER', 'IT');

// Images are global catalog assets today (the table has no branch ownership).
// Keep both reads and mutations behind an explicit global-asset authority gate.
router.post('/', authenticateToken, imageAdmin, uploadImage);
router.get('/:id', authenticateToken, imageAdmin, getImage);
router.delete('/:id', authenticateToken, imageAdmin, deleteImage);

export default router;
