import { Router } from 'express';
import * as butcheryController from '../controllers/butcheryController';
import { requireRoles } from '../middleware/auth';
import { enforceBranch } from '../middleware/branchIsolation';

const router = Router();

const butcheryAuth = requireRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'PRODUCTION_STAFF', 'WAREHOUSE_DIRECTOR');
const butcheryManage = requireRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'WAREHOUSE_DIRECTOR');

router.get('/operations', butcheryAuth, enforceBranch, butcheryController.getButcheryOperations);
router.post('/operations', butcheryAuth, enforceBranch, butcheryController.createButcheryOperation);
router.get('/operations/:id', butcheryAuth, enforceBranch, butcheryController.getButcheryOperationById);
router.put('/operations/:id', butcheryAuth, enforceBranch, butcheryController.updateButcheryOperation);
router.delete('/operations/:id', butcheryManage, enforceBranch, butcheryController.deleteButcheryOperation);
router.post('/operations/:id/post', butcheryManage, enforceBranch, butcheryController.postButcheryOperation);
router.post('/operations/:id/cancel', butcheryManage, enforceBranch, butcheryController.cancelButcheryOperation);

router.get('/templates', butcheryAuth, enforceBranch, butcheryController.getButcheryTemplates);
router.post('/templates', butcheryManage, enforceBranch, butcheryController.createButcheryTemplate);
router.delete('/templates/:id', butcheryManage, enforceBranch, butcheryController.deleteButcheryTemplate);

router.get('/yield-report', butcheryAuth, enforceBranch, butcheryController.getButcheryYieldReport);

export default router;
