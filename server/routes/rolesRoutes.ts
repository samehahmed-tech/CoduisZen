import { Router } from 'express';
import * as rolesController from '../controllers/rolesController';
import { requireRoles, requireRoleOrPermission } from '../middleware/auth';

const router = Router();
const readAccess = requireRoleOrPermission(['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER'], ['CFG_MANAGE_ROLES', 'CFG_MANAGE_USERS']);
const writeAccess = requireRoleOrPermission(['SUPER_ADMIN'], ['CFG_MANAGE_ROLES']);

router.get('/', readAccess, rolesController.getAllRoles);
router.get('/permissions', readAccess, rolesController.getPermissionDefinitions);
router.post('/sync', writeAccess, rolesController.syncPermissions);
router.get('/:id', readAccess, rolesController.getRole);
router.post('/', writeAccess, rolesController.createRole);
router.put('/:id', writeAccess, rolesController.updateRole);
router.delete('/:id', writeAccess, rolesController.deleteRole);

export default router;
