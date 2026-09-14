import express from 'express';
import path from 'path';
import cors from 'cors';
import compression from 'compression';
import { helmetMiddleware, inputSanitizer, hideErrorDetails, csrfProtection } from './middleware/security';
import { auditMiddleware } from './middleware/audit';
import logger from './utils/logger';
import posModule from './modules/pos';
import inventoryModule from './modules/inventory';
import hrModule from './modules/hr';
import financeModule from './modules/finance';
import intelligenceModule from './modules/intelligence';
import marketingModule from './modules/marketing';
import coreModule from './modules/core';
import admsRoutes from './routes/admsRoutes';
import whatsappWebhookRoutes from './routes/whatsappWebhookRoutes';
import { authenticateToken, requireRoles } from './middleware/auth';
import { isOriginAllowed } from './config/cors';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { attachRequestId, requestLogger } from './middleware/requestContext';
import { errorContractMiddleware } from './middleware/errorContract';
import { apiCacheHeaders } from './middleware/cacheHeaders';
import { errorTrackingMiddleware, getRecentErrors, getErrorStats } from './services/errorTrackingService';
import { enforceHttps, hstsHeader } from './middleware/sslEnforcement';
import { healthService } from './services/healthService';
import { ensureUploadsDirectory, uploadsDirectory } from './utils/imageStorage';

const app = express();
app.set('trust proxy', 1);

// ── Performance Middlewares ──
// threshold 512: small API JSON payloads (orders/menu/settings deltas) also
// compress — the dominant cost on LAN is round-trips, not CPU.
app.use(compression({ threshold: 512, level: 6, memLevel: 8 })); // gzip for responses > 512B

// ── SSL/TLS Enforcement ──
app.use(enforceHttps);
app.use(hstsHeader);

// ── Security Middlewares ──
app.use(helmetMiddleware);
app.use(cors({
    origin: (origin, callback) => {
        if (isOriginAllowed(origin)) {
            callback(null, true);
            return;
        }
        if (process.env.NODE_ENV !== 'production') {
            callback(null, true);
            return;
        }
        callback(null, false);
    },
    credentials: true,
}));
app.use(express.json({
    limit: '5mb',
    verify: (req, _res, buffer) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
    },
}));
app.use(express.urlencoded({ limit: '5mb', extended: true }));
app.use(inputSanitizer);
app.use(csrfProtection);
app.use(auditMiddleware);
app.use(attachRequestId);
app.use(requestLogger);
app.use(errorContractMiddleware);
app.use(apiCacheHeaders);

logger.info({ port: process.env.API_PORT || 3001, env: process.env.NODE_ENV || 'development' }, 'Coduis Zen server initializing');

ensureUploadsDirectory();
app.use('/uploads', express.static(uploadsDirectory, {
    fallthrough: false,
    maxAge: '7d',
    immutable: true,
}));

import authRoutes from './routes/authRoutes';
import setupRoutes from './routes/setupRoutes';
import printGatewayGatewayRoutes from './routes/printGatewayGatewayRoutes';
import attendanceBridgeRoutes from './routes/attendanceBridgeRoutes';
import publicScreenRoutes from './routes/publicScreenRoutes';
import deploymentRoutes from './routes/deploymentRoutes';

// Public Routes & Modules
app.use('/api/auth', authRoutes); // Expose auth globally before token check
app.use('/api/setup', setupRoutes); // Expose setup globally
app.use('/api/whatsapp', whatsappWebhookRoutes); // Public WhatsApp webhook only
app.use('/api/attendance-bridge', attendanceBridgeRoutes); // Expose branch attendance bridge ingest
app.use('/api/public-screens', publicScreenRoutes); // Link-only KDS/Packing screens for legacy operator displays
app.use('/api/deployment', deploymentRoutes);
app.use('/iclock', admsRoutes); // ADMS Biometric Endpoint (Must be top-level)

// Bridge routes — fail closed unless PRINT_GATEWAY_TOKEN is configured and supplied.
app.use('/api/print-gateway/gateway', printGatewayGatewayRoutes); // SSE bridge connect
import printGatewayRoutes from './routes/printGatewayRoutes';
app.use('/api/print-gateway', printGatewayRoutes); // Bridge polling + complete/fail

// Health check (Public)
app.get('/api/health', async (req, res) => {
    const status = await healthService.getStatus();
    const httpStatus = status.status === 'HEALTHY' ? 200 : 503;
    res.status(httpStatus).json({
        status: status.status === 'HEALTHY' ? 'ok' : 'degraded',
        health: status,
    });
});

// Protected Routes
app.use('/api', authenticateToken);

// Protected Modules
app.use('/api/core', coreModule); // Backward-compatible core aliases, protected by the global API auth guard.
app.use('/api/pos', posModule);
app.use('/api/inventory', inventoryModule);
app.use('/api/hr', requireRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'HR_MANAGER', 'PAYROLL_OFFICER'), hrModule);
app.use('/api/finance', requireRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'ACCOUNTANT', 'FINANCE_DIRECTOR'), financeModule);
app.use('/api/marketing', marketingModule);
app.use('/api/intelligence', requireRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'ACCOUNTANT', 'FINANCE_DIRECTOR'), intelligenceModule);

// ── Top-level route aliases ──
// The frontend calls flat paths like /api/settings, /api/orders etc.
// These aliases ensure backward compatibility with the modular mount points above.
import settingsRoutes from './routes/settingsRoutes';
import branchRoutes from './routes/branchRoutes';
import printerRoutes from './routes/printerRoutes';
import userRoutes from './routes/userRoutes';
import customerRoutes from './routes/customerRoutes';
import orderRoutes from './routes/orderRoutes';
import tableRoutes from './routes/tableRoutes';
import shiftRoutes from './routes/shiftRoutes';
import reportRoutes from './routes/reportRoutes';
import supplierRoutes from './routes/supplierRoutes';
import warehouseRoutes from './routes/warehouseRoutes';
import kdsRoutes from './routes/kdsRoutes';
import deliveryRoutes from './routes/deliveryRoutes';
import imageRoutes from './routes/imageRoutes';
import platformsRoutes from './routes/platformsRoutes';
import refundRoutes from './routes/refundRoutes';
import dayCloseRoutes from './routes/dayCloseRoutes';
import fiscalRoutes from './routes/fiscalRoutes';
import aiRoutes from './routes/aiRoutes';
import auditRoutes from './routes/auditRoutes';
import campaignRoutes from './routes/campaignRoutes';
import purchaseOrderRoutes from './routes/purchaseOrderRoutes';
import productionRoutes from './routes/productionRoutes';
import wastageRoutes from './routes/wastageRoutes';
import inventoryIntelligenceRoutes from './routes/inventoryIntelligenceRoutes';
import hrExtendedRoutes from './routes/hrExtendedRoutes';
import barcodeRoutes from './routes/barcodeRoutes';
import whatsappRoutes from './routes/whatsappRoutes';
import waitlistRoutes from './routes/waitlistRoutes';
import reservationRoutes from './routes/reservationRoutes';
import subscriptionRoutes from './routes/subscriptionRoutes';
import ttsRoutes from './routes/ttsRoutes';
import mailRoutes from './routes/mailRoutes';

app.use('/api/settings', settingsRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/printers', printerRoutes);
app.use('/api/users', userRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/tables', tableRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/warehouses', warehouseRoutes);
app.use('/api/kds', kdsRoutes);
app.use('/api/delivery', deliveryRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/platforms', platformsRoutes);
app.use('/api/refunds', refundRoutes);
app.use('/api/day-close', dayCloseRoutes);
app.use('/api/fiscal', fiscalRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);
app.use('/api/production', productionRoutes);
app.use('/api/wastage', wastageRoutes);
app.use('/api/inventory-intelligence', inventoryIntelligenceRoutes);
app.use('/api/hr-extended', requireRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'HR_MANAGER', 'PAYROLL_OFFICER'), hrExtendedRoutes);
app.use('/api/barcode', barcodeRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/waitlist', waitlistRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/tts', ttsRoutes);
app.use('/api/mail', mailRoutes);

// Legacy/Specific Support (to be moved fully in next phase)
import approvalRoutes from './routes/approvalRoutes';
import menuRoutes from './routes/menuRoutes';
import callCenterSupervisorRoutes from './routes/callCenterSupervisorRoutes';
import webhookRoutes from './routes/webhookRoutes';
import migrationRoutes from './routes/migrationRoutes';
import analyticsRoutes from './routes/analyticsRoutes';
import attendanceOpsRoutes from './routes/attendanceOpsRoutes';
import paymentRoutes from './routes/paymentRoutes';
import rolesRoutes from './routes/rolesRoutes';

app.use('/api/approvals', requireRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'CASHIER', 'WAITER', 'CALL_CENTER', 'CALL_CENTER_MANAGER', 'CALL_CENTER_AGENT'), approvalRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/roles', rolesRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/call-center', requireRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'CALL_CENTER_MANAGER', 'CALL_CENTER', 'CALL_CENTER_AGENT'), callCenterSupervisorRoutes);
app.use('/api/webhooks', requireRoles('SUPER_ADMIN', 'OWNER'), webhookRoutes);
app.use('/api/migration', requireRoles('SUPER_ADMIN', 'OWNER'), migrationRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/attendance-ops', requireRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'HR_MANAGER'), attendanceOpsRoutes);


// Error tracking API (ops)
app.get('/api/ops/errors', requireRoles('SUPER_ADMIN'), (_req, res) => {
    res.json({ errors: getRecentErrors(), stats: getErrorStats() });
});

// 404 handler for undefined routes
app.use('/api/{*path}', notFoundHandler);

// ── Static Frontend (production) ──
if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath, {
        maxAge: 0,
        setHeaders: (res, filePath) => {
            const normalizedPath = filePath.replace(/\\/g, '/');
            const fileName = path.basename(filePath);

            if (fileName === 'index.html' || fileName === 'sw.js' || fileName === 'service-worker.js') {
                res.setHeader('Cache-Control', 'no-store');
                return;
            }

            if (fileName === 'manifest.json') {
                res.setHeader('Cache-Control', 'public, max-age=300');
                return;
            }

            if (normalizedPath.includes('/dist/assets/')) {
                res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
                return;
            }

            res.setHeader('Cache-Control', 'public, max-age=86400');
        },
    }));
    // SPA fallback — serve index.html for all non-API routes
    app.use((req, res, next) => {
        if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/iclock')) {
            next();
            return;
        }
        if (path.extname(req.path)) {
            res.status(404).type('text/plain').send('Not found');
            return;
        }
        res.setHeader('Cache-Control', 'no-store');
        res.sendFile(path.join(distPath, 'index.html'));
    });
}

// Error tracking middleware (captures before global handler)
app.use(errorTrackingMiddleware);

// Production error detail hiding
app.use(hideErrorDetails);

// Global error handler (must be last)
app.use(errorHandler);

export default app;
