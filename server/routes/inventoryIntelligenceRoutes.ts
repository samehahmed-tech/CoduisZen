import { Router } from 'express';
import * as ctrl from '../controllers/inventoryIntelligenceController';

const router = Router();

// Reorder & Purchasing
router.get('/reorder-alerts', ctrl.getReorderAlerts);
router.get('/purchase-suggestions', ctrl.getPurchaseSuggestions);

// Unit Conversion
router.get('/convert-unit', ctrl.convertUnit);
router.get('/supported-units', ctrl.getSupportedUnits);

// Stock Count
router.post('/stock-count', ctrl.createStockCount);
router.put('/stock-count/:sessionId', ctrl.updateStockCount);
router.post('/stock-count/:sessionId/complete', ctrl.completeStockCount);

// AI Forecasting
router.get('/forecast/:itemId', ctrl.getAIForecast);

export default router;
