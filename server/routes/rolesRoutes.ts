import { Router } from 'express';
import * as rolesController from '../controllers/rolesController';
import { requireRoles } from '../middleware/auth';

const router = Router();
// Roles and permission definitions are tenant-wide security policy. A branch
// permission must not unlock global role mutation or permission discovery.
const readAccess = requireRoles('SUPER_ADMIN', 'OWNER', 'CEO', 'COO', 'GENERAL_MANAGER');
const writeAccess = requireRoles('SUPER_ADMIN', 'OWNER', 'CEO', 'COO', 'GENERAL_MANAGER');

router.get('/', readAccess, rolesController.getAllRoles);
router.get('/permissions', readAccess, rolesController.getPermissionDefinitions);
router.post('/sync', writeAccess, rolesController.syncPermissions);
router.get('/:id', readAccess, rolesController.getRole);
router.post('/', writeAccess, rolesController.createRole);
router.put('/:id', writeAccess, rolesController.updateRole);
router.delete('/:id', writeAccess, rolesController.deleteRole);

export default router;
