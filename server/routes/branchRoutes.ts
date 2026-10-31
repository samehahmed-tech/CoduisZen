import { Router } from 'express';
import { validate } from '../middleware/validate';
import { anySchema } from '../middleware/validation';
import * as branchController from '../controllers/branchController';
import { requireRoleOrPermission } from '../middleware/auth';
import { enforceBranch } from '../middleware/branchIsolation';

const router = Router();
// OWNER was missing here entirely (an owner could not manage branches).
const branchTopologyAdmin = requireRoleOrPermission(
    ['SUPER_ADMIN', 'OWNER'],
    ['CFG_MANAGE_BRANCHES'],
);
const branchUpdateAuth = requireRoleOrPermission(
    ['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER'],
    ['CFG_MANAGE_BRANCHES'],
);

router.get('/', branchController.getAllBranches);
router.post('/', branchTopologyAdmin, validate(anySchema), branchController.createBranch);
router.put('/:id', branchUpdateAuth, enforceBranch, validate(anySchema), branchController.updateBranch);
router.delete('/:id', branchTopologyAdmin, validate(anySchema), branchController.deleteBranch);

export default router;
