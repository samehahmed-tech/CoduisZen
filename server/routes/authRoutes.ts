import { Router } from 'express';
import {
    confirmMfaSetup,
    disableMfa,
    getSessions,
    initiateMfaSetup,
    login,
    loginWithPin,
    logout,
    me,
    revokeOtherSessions,
    revokeSession,
    verifyMfaChallenge,
    setupPin,
    disablePin,
    adminSetUserPin,
    refreshAccessToken,
    changePassword,
    getPasswordPolicy,
    getLoginAuditLog,
    getAdminSessions,
    adminRevokeSession,
} from '../controllers/authController';
import { authenticateToken } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { loginSchema, pinLoginSchema, mfaVerifySchema, setupPinSchema } from '../middleware/validation';

const router = Router();

// Standard login (with Zod validation)
router.post('/login', validate(loginSchema), login);
router.post('/pin-login', validate(pinLoginSchema), loginWithPin);
router.post('/mfa/verify', validate(mfaVerifySchema), verifyMfaChallenge);
router.post('/refresh', refreshAccessToken);

// Protected routes
router.get('/me', authenticateToken, me);
router.post('/logout', authenticateToken, logout);

// Password management
router.post('/change-password', authenticateToken, changePassword);
router.get('/password-policy', getPasswordPolicy);

// Session management (own sessions)
router.get('/sessions', authenticateToken, getSessions);
router.delete('/sessions/:id', authenticateToken, revokeSession);
router.post('/sessions/revoke-others', authenticateToken, revokeOtherSessions);

// Admin: Login Audit Log & Session Management
router.get('/admin/login-audit', authenticateToken, getLoginAuditLog);
router.get('/admin/sessions', authenticateToken, getAdminSessions);
router.delete('/admin/sessions/:id', authenticateToken, adminRevokeSession);

// MFA management
router.post('/mfa/setup/initiate', authenticateToken, initiateMfaSetup);
router.post('/mfa/setup/confirm', authenticateToken, confirmMfaSetup);
router.post('/mfa/disable', authenticateToken, disableMfa);

// PIN management
router.post('/pin/setup', authenticateToken, validate(setupPinSchema), setupPin);
router.post('/pin/disable', authenticateToken, disablePin);
router.post('/pin/admin-set', authenticateToken, adminSetUserPin);

export default router;
