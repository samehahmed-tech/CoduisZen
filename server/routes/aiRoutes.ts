import { Router } from 'express';
import { requireRoles } from '../middleware/auth';
import { chatAssistant, executeAction, getAiKeyConfig, getInsights, previewAction, updateAiKeyConfig, getRevenueForecast } from '../controllers/aiController';

const router = Router();

// All routes below are already protected by `authenticateToken` (applied globally on /api in app.ts).
// Role-based restrictions are added here for defense-in-depth.
const aiOperationalRoles = requireRoles(
    'SUPER_ADMIN',
    'OWNER',
    'CEO',
    'COO',
    'GENERAL_MANAGER',
    'BRANCH_MANAGER',
    'CALL_CENTER_MANAGER',
    'CASHIER_MANAGER',
    'WAREHOUSE_DIRECTOR',
    'PROCUREMENT_MANAGER',
    'ACCOUNTANT',
    'COST_ACCOUNTANT',
    'FINANCE_DIRECTOR',
    'HR_MANAGER',
    'PAYROLL_OFFICER',
    'TECH_SUPPORT',
);

// GET AI-driven insights with caching
router.get('/insights', aiOperationalRoles, getInsights);

// GET Revenue Forecast
router.get('/forecast', aiOperationalRoles, getRevenueForecast);

// POST chat orchestration
router.post('/chat', aiOperationalRoles, chatAssistant);

// POST preview suggested action (guard + permission)
router.post('/action-preview', aiOperationalRoles, previewAction);

// POST execute suggested action (guard + permission + audit)
router.post('/action-execute', aiOperationalRoles, executeAction);

// Legacy alias for existing frontend paths
router.post('/execute', aiOperationalRoles, executeAction);

// AI key management (server-side encrypted)
router.get('/key-config', requireRoles('SUPER_ADMIN', 'BRANCH_MANAGER'), getAiKeyConfig);
router.put('/key-config', requireRoles('SUPER_ADMIN', 'BRANCH_MANAGER'), updateAiKeyConfig);

export default router;
