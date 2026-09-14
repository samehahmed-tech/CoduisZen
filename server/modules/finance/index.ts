import { Router } from 'express';
import financeRoutes from '../../routes/financeRoutes';
import budgetRoutes from '../../routes/budgetRoutes';
import fiscalRoutes from '../../routes/fiscalRoutes';
import p1FinanceRoutes from '../../routes/p1FinanceRoutes';

const router = Router();

router.use('/', financeRoutes);
router.use('/budgets', budgetRoutes);
router.use('/fiscal', fiscalRoutes);
// P1 financial backbone: drawers, bank accounts, transfers, treasury vouchers,
// tips, gifts, gateways, daily P&L — mounted at /api/finance/p1/*
router.use('/p1', p1FinanceRoutes);

export default router;
