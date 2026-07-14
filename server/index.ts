import * as dotenv from 'dotenv';
dotenv.config({ path: ['.env.local', '.env'] as any });

import app from './app';
import http from 'http';
import { initSocket, closeSocket } from './socket';
import { closeDatabase } from './db';
import { initRedisCache } from './utils/redisCache';
import { validateEnvironment } from '../scripts/validate-env';

const PORT = process.env.API_PORT || 3001;

const server = http.createServer(app);

const shouldStartWhatsAppEngine = () => {
    const provider = String(process.env.WHATSAPP_PROVIDER || 'disabled').toLowerCase();
    return process.env.ENABLE_WHATSAPP_WEB === 'true'
        || provider === 'openwa'
        || provider === 'web'
        || provider === 'whatsapp-web'
        || provider === 'whatsapp-web.js';
};

const shouldStartDirectZktecoAutoSync = () => {
    return process.env.ATTENDANCE_DIRECT_ZK_AUTOSYNC === 'true'
        || process.env.ENABLE_ZKTECO_AUTO_SYNC === 'true';
};

const start = async () => {
    // Launch Gates — fail fast if critical config is missing (Sprint 3)
    const isProduction = process.env.NODE_ENV === 'production';
    const requiredVars = ['DATABASE_URL', 'JWT_SECRET'];
    if (isProduction) {
        const validation = validateEnvironment();
        if (!validation.valid) {
            console.error(`LAUNCH GATE FAILED:\n${validation.errors.join('\n')}`);
            process.exit(1);
        }
        const missing = requiredVars.filter(k => !process.env[k]);
        if (missing.length > 0) {
            console.error(`🚫 LAUNCH GATE FAILED: Missing required env vars: ${missing.join(', ')}`);
            process.exit(1);
        }
        // Conditional gates
        if (process.env.GO_LIVE_REQUIRE_ETA === 'true') {
            const etaVars = [
                'ETA_BASE_URL', 'ETA_TOKEN_URL', 'ETA_CLIENT_ID', 'ETA_CLIENT_SECRET', 'ETA_API_KEY',
                'ETA_PRIVATE_KEY', 'ETA_RIN', 'ETA_COMPANY_NAME', 'ETA_BRANCH_CODE', 'ETA_COUNTRY',
                'ETA_GOVERNATE', 'ETA_CITY', 'ETA_STREET', 'ETA_BUILDING',
            ];
            const missingEta = etaVars.filter(k => !process.env[k]);
            if (missingEta.length > 0) {
                console.error(`🚫 LAUNCH GATE FAILED: ETA is required but missing: ${missingEta.join(', ')}`);
                process.exit(1);
            }
        }
        if (process.env.SOCKET_REDIS_ENABLED === 'true' && !process.env.SOCKET_REDIS_URL && !process.env.REDIS_CACHE_URL) {
            console.error('🚫 LAUNCH GATE FAILED: SOCKET_REDIS_ENABLED=true but SOCKET_REDIS_URL/REDIS_CACHE_URL is missing');
            process.exit(1);
        }
    }

    await initSocket(server);
    const HOST = process.env.HOST || '0.0.0.0';
    server.listen(Number(PORT), HOST, () => {
        console.log(`Coduis Zen Backend - Production Modular Foundation - running on ${HOST}:${PORT}`);
    });

    if (shouldStartWhatsAppEngine()) {
        import('./services/whatsappService')
            .then(w => w.whatsappService.initialize())
            .catch(err => console.error('Could not start WhatsApp engine:', err));
    } else {
        console.log('WhatsApp Web engine disabled. Set WHATSAPP_PROVIDER=whatsapp-web or ENABLE_WHATSAPP_WEB=true to enable it.');
    }
    import('./services/retentionService').then(r => r.retentionService.startCron());
    import('./services/dynamicPricingService').then(d => d.dynamicPricingService.startCron(60));
    if (shouldStartDirectZktecoAutoSync()) {
        import('./services/zktecoConnectorService')
            .then(z => z.zktecoConnectorService.startAutoSync(Number(process.env.ATTENDANCE_DIRECT_ZK_INTERVAL_MINUTES || 15)))
            .catch(err => console.error('Could not start direct ZKTeco auto-sync:', err));
    } else {
        console.log('Direct ZKTeco auto-sync disabled. Branch attendance bridges remain enabled.');
    }
    import('./services/alertService').then(a => a.alertService.startHealthMonitor());
    import('./services/backupCronService').then(b => b.backupCronService.startDailyBackup(3));
    
    await initRedisCache();
    import('./workers/checkoutWorker').then(w => w.startCheckoutWorker());
    
};

start().catch((error) => {
    console.error('Server startup failed:', error);
    process.exit(1);
});

const shutdown = async () => {
    await closeSocket();
    await closeDatabase();
    process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
