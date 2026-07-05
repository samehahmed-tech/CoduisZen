import { Router } from 'express';
import * as rolesController from '../controllers/rolesController';
import { requireRoles } from '../middleware/auth';

const router = Router();

router.get('/', requireRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER'), rolesController.getAllRoles);
router.get('/permissions', requireRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER'), rolesController.getPermissionDefinitions);
router.post('/sync', requireRoles('SUPER_ADMIN'), rolesController.syncPermissions);
router.get('/:id', requireRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER'), rolesController.getRole);
router.post('/', requireRoles('SUPER_ADMIN'), rolesController.createRole);
router.put('/:id', requireRoles('SUPER_ADMIN'), rolesController.updateRole);
router.delete('/:id', requireRoles('SUPER_ADMIN'), rolesController.deleteRole);

export default router;
