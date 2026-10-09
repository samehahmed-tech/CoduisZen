import { Router } from 'express';
import * as campaignController from '../controllers/campaignController';
import { requireRoles, requireRoleOrPermission } from '../middleware/auth';

const router = Router();

const marketingAuth = requireRoleOrPermission(
    ['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'MARKETING_MANAGER'],
    ['OP_MANAGE_MARKETING'],
);

router.get('/', campaignController.getCampaigns);
router.get('/stats', campaignController.getCampaignStats);
router.post('/', marketingAuth, campaignController.createCampaign);
router.post('/:id/dispatch', marketingAuth, campaignController.dispatchCampaign);
router.put('/:id', marketingAuth, campaignController.updateCampaign);
router.delete('/:id', requireRoles('SUPER_ADMIN', 'OWNER'), campaignController.deleteCampaign);

export default router;
