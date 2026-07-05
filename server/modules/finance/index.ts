import { Router } from 'express';
import financeRoutes from '../../routes/financeRoutes';
import budgetRoutes from '../../routes/budgetRoutes';
import fiscalRoutes from '../../routes/fiscalRoutes';

const router = Router();

router.use('/', financeRoutes);
router.use('/budgets', budgetRoutes);
router.use('/fiscal', fiscalRoutes);

export default router;
