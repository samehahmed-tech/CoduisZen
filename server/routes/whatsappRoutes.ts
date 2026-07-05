import { Router } from 'express';
import { requireRoles } from '../middleware/auth';
import {
    getWhatsAppEscalations,
    getWhatsAppAutomationConfig,
    getWhatsAppInbox,
    getWhatsAppStatus,
    resolveWhatsAppEscalation,
    resetWhatsAppSession,
    saveWhatsAppAutomationConfig,
    sendWhatsAppTest,
    restartWhatsAppEngine,
    sendWhatsAppCampaign
} from '../controllers/whatsappController';

const router = Router();
const whatsappOperators = [
    'SUPER_ADMIN',
    'OWNER',
    'CEO',
    'COO',
    'GENERAL_MANAGER',
    'BRANCH_MANAGER',
    'MANAGER',
    'CALL_CENTER_MANAGER',
    'TECH_SUPPORT',
];

router.get('/status', requireRoles(...whatsappOperators), getWhatsAppStatus);
router.post('/restart', requireRoles(...whatsappOperators), restartWhatsAppEngine);
router.post('/reset-session', requireRoles(...whatsappOperators), resetWhatsAppSession);
router.get('/automation-config', requireRoles(...whatsappOperators), getWhatsAppAutomationConfig);
router.put('/automation-config', requireRoles(...whatsappOperators), saveWhatsAppAutomationConfig);
router.post('/campaign', requireRoles(...whatsappOperators), sendWhatsAppCampaign);
router.post('/send-message', requireRoles(...whatsappOperators), sendWhatsAppTest);
router.post('/send-test', requireRoles(...whatsappOperators), sendWhatsAppTest);
router.get('/inbox', requireRoles(...whatsappOperators), getWhatsAppInbox);
router.get('/escalations', requireRoles(...whatsappOperators), getWhatsAppEscalations);
router.put('/escalations/:id/resolve', requireRoles(...whatsappOperators), resolveWhatsAppEscalation);

export default router;
