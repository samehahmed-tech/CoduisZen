import { Router } from 'express';
import * as analyticsController from '../controllers/analyticsController';
import { scopeBranchQuery } from '../middleware/branchIsolation';
import { requirePermission } from '../middleware/auth';

const router = Router();

// Consolidated reporting resolves its own head-office/branch scope; it must
// run before the ordinary branch middleware injects a single branch into the query.
router.get('/consolidated', requirePermission('DATA_VIEW_REVENUE'), analyticsController.getConsolidatedPerformance);
router.use(scopeBranchQuery);
router.use(requirePermission('DATA_VIEW_REVENUE'));

router.get('/branches', analyticsController.getBranchPerformance);
router.get('/channel-performance', analyticsController.getChannelPerformance);
router.get('/labor-efficiency', requirePermission('DATA_VIEW_SALARIES'), analyticsController.getLaborEfficiency);
router.get('/leaderboard', analyticsController.getUserLeaderboard);
router.get('/anomalies', analyticsController.getOperationalAnomalies);
router.get('/metrics/catalog', analyticsController.getMetricCatalog);
router.get('/reconciliation', analyticsController.getAnalyticsReconciliation);

export default router;
