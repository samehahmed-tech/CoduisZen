import { Router } from 'express';
import * as userController from '../controllers/userController';
import { validate } from '../middleware/validate';
import { createUserSchema, updateUserSchema } from '../middleware/validation';
import { requireRoleOrPermission } from '../middleware/auth';

const router = Router();
const manageUsersAuth = requireRoleOrPermission(['SUPER_ADMIN'], ['CFG_MANAGE_USERS']);

router.get('/', manageUsersAuth, userController.getAllUsers);
router.post('/', manageUsersAuth, validate(createUserSchema), userController.createUser);

router.post('/bulk/create', manageUsersAuth, userController.bulkCreateUsers);
router.post('/bulk/update-status', manageUsersAuth, userController.bulkUpdateStatus);
router.post('/bulk/assign-role', manageUsersAuth, userController.bulkAssignRole);
router.post('/bulk/assign-branch', manageUsersAuth, userController.bulkAssignBranch);
router.post('/bulk/delete', manageUsersAuth, userController.bulkDeleteUsers);

router.get('/export/csv', manageUsersAuth, userController.exportUsersCSV);
router.get('/sessions/active', manageUsersAuth, userController.getAllActiveSessions);
router.get('/audit/user-changes', manageUsersAuth, userController.getUserAuditChanges);

router.get('/:id', manageUsersAuth, userController.getUserById);
router.put('/:id', manageUsersAuth, validate(updateUserSchema), userController.updateUser);
router.delete('/:id', manageUsersAuth, userController.deleteUser);
router.get('/:id/sessions', manageUsersAuth, userController.getUserSessions);
router.post('/:id/sessions/:sessionId/revoke', manageUsersAuth, userController.revokeUserSession);
router.post('/:id/sessions/revoke-all', manageUsersAuth, userController.revokeAllUserSessions);
router.get('/:id/activity', manageUsersAuth, userController.getUserActivity);
router.post('/:id/mfa/reset', manageUsersAuth, userController.resetUserMFA);
router.post('/:id/reset-pin', manageUsersAuth, userController.resetUserPin);
router.post('/:id/reset-password', manageUsersAuth, userController.adminResetPassword);
router.get('/:id/login-history', manageUsersAuth, userController.getLoginHistory);
router.post('/:id/toggle-active', manageUsersAuth, userController.toggleUserActive);
router.put('/:id/permissions', manageUsersAuth, userController.updateUserPermissions);
router.get('/:id/effective-permissions', manageUsersAuth, userController.getEffectivePermissions);
router.put('/:id/branch-access', manageUsersAuth, userController.updateBranchAccess);

export default router;
