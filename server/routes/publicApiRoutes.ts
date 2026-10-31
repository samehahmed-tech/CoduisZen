import { Router } from 'express';
import { createPublicApiCheckout, createPublicApiOrder, getPublicApiBranchHours, getPublicApiMenu, getPublicApiOpenApi, getPublicApiOrder, listPublicApiOrders, listPublicApiSandboxOrders, quotePublicApiOrder } from '../controllers/publicApiController';
import { issuePublicApiAccessToken } from '../controllers/publicApiOAuthController';
import { authorizePublicApi } from '../controllers/publicApiOAuthAuthorizeController';
import { authenticateManagedPublicApiKey, requirePublicApiBranch, requirePublicApiScope } from '../services/publicApiKeyService';
import { authenticatePublicQr } from '../middleware/publicQrAuth';
import { authenticateToken } from '../middleware/auth';
import { oauthRateLimiter } from '../middleware/rateLimit';

const router = Router();

router.use((_req, res, next) => {
    res.setHeader('X-RestoFlow-API-Version', 'v1');
    next();
});

router.get('/openapi.json', getPublicApiOpenApi);
router.get('/oauth/authorize', oauthRateLimiter, authenticateToken, authorizePublicApi);
router.post('/oauth/token', oauthRateLimiter, issuePublicApiAccessToken);
router.get('/branches/:branchId/orders', authenticateManagedPublicApiKey, requirePublicApiScope('orders:read'), requirePublicApiBranch, listPublicApiOrders);
router.get('/branches/:branchId/orders/:orderId', authenticateManagedPublicApiKey, requirePublicApiScope('orders:read'), requirePublicApiBranch, getPublicApiOrder);
router.post('/branches/:branchId/orders', authenticateManagedPublicApiKey, requirePublicApiScope('orders:write'), requirePublicApiBranch, createPublicApiOrder);
router.post('/branches/:branchId/orders/:orderId/checkout', authenticateManagedPublicApiKey, requirePublicApiScope('orders:write'), requirePublicApiBranch, createPublicApiCheckout);
router.get('/branches/:branchId/menu', authenticateManagedPublicApiKey, requirePublicApiScope('menu:read'), requirePublicApiBranch, getPublicApiMenu);
router.get('/branches/:branchId/hours', authenticateManagedPublicApiKey, requirePublicApiScope('menu:read'), requirePublicApiBranch, getPublicApiBranchHours);
router.post('/branches/:branchId/orders/quote', authenticateManagedPublicApiKey, requirePublicApiScope('orders:quote'), requirePublicApiBranch, quotePublicApiOrder);
router.get('/qr/branches/:branchId/tables/:tableId/menu', authenticatePublicQr, requirePublicApiScope('menu:read'), requirePublicApiBranch, getPublicApiMenu);
router.post('/qr/branches/:branchId/tables/:tableId/orders', authenticatePublicQr, requirePublicApiScope('orders:write'), requirePublicApiBranch, createPublicApiOrder);
router.get('/sandbox/orders', authenticateManagedPublicApiKey, requirePublicApiScope('sandbox:read'), listPublicApiSandboxOrders);

export default router;
