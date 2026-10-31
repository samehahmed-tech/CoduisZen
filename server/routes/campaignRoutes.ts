import { Router } from 'express';
import * as campaignController from '../controllers/campaignController';
import { requireRoles, requireRoleOrPermission } from '../middleware/auth';
import { enforceBranch } from '../middleware/branchIsolation';

const router = Router();
router.use(enforceBranch);

const marketingAuth = requireRoleOrPermission(
    ['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'MARKETING_MANAGER'],
    ['OP_MANAGE_MARKETING'],
);

router.get('/', marketingAuth, campaignController.getCampaigns);
router.get('/stats', marketingAuth, campaignController.getCampaignStats);
router.get('/automation-config', marketingAuth, campaignController.getCampaignAutomationConfig);
router.put('/automation-config', marketingAuth, campaignController.saveCampaignAutomationConfig);
router.get('/:id/logs', marketingAuth, campaignController.getCampaignDeliveryLogs);
router.post('/', marketingAuth, campaignController.createCampaign);
router.post('/:id/dispatch', marketingAuth, campaignController.dispatchCampaign);
router.put('/:id', marketingAuth, campaignController.updateCampaign);
router.delete('/:id', requireRoles('SUPER_ADMIN', 'OWNER'), campaignController.deleteCampaign);

export default router;
