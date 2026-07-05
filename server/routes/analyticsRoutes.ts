import { Router } from 'express';
import * as analyticsController from '../controllers/analyticsController';
import { scopeBranchQuery } from '../middleware/branchIsolation';

const router = Router();

router.use(scopeBranchQuery);

router.get('/branches', analyticsController.getBranchPerformance);
router.get('/labor-efficiency', analyticsController.getLaborEfficiency);
router.get('/leaderboard', analyticsController.getUserLeaderboard);

export default router;
