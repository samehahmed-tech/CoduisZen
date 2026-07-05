import { Router } from 'express';
import {
    approveDiscountViolation,
    addCoachingNote,
    autoScanEscalations,
    createEscalation,
    getDiscountAbuse,
    getCoachingNotes,
    getEscalations,
    resolveEscalation,
    getBranchHealth,
    getFailedOrders,
    retryFailedOrder,
    getDailyOrderSummary,
} from '../controllers/callCenterSupervisorController';

const router = Router();

router.get('/escalations', getEscalations);
router.post('/escalations', createEscalation);
router.post('/escalations/scan', autoScanEscalations);
router.put('/escalations/:id/resolve', resolveEscalation);
router.get('/coaching-notes', getCoachingNotes);
router.post('/coaching-notes', addCoachingNote);
router.get('/discount-abuse', getDiscountAbuse);
router.post('/discount-abuse/approve', approveDiscountViolation);

// Advanced scenarios
router.get('/branch-health', getBranchHealth);
router.get('/failed-orders', getFailedOrders);
router.put('/failed-orders/:id/retry', retryFailedOrder);
router.get('/daily-summary', getDailyOrderSummary);

export default router;
