import { Router } from 'express';
import { validate } from '../middleware/validate';
import { anySchema } from '../middleware/validation';
import * as branchController from '../controllers/branchController';
import { requireRoleOrPermission } from '../middleware/auth';

const router = Router();
// OWNER was missing here entirely (an owner could not manage branches).
const managerAuth = requireRoleOrPermission(
    ['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'MANAGER'],
    ['CFG_MANAGE_BRANCHES'],
);

router.get('/', branchController.getAllBranches);
router.post('/', managerAuth, validate(anySchema), branchController.createBranch);
router.put('/:id', managerAuth, validate(anySchema), branchController.updateBranch);
router.delete('/:id', managerAuth, branchController.deleteBranch);

export default router;
