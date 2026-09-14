import './config/loadEnv';
import app from './app';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { initSocket, closeSocket } from './socket';
import { closeDatabase } from './db';
import { initRedisCache } from './utils/redisCache';
import { validateEnvironment } from '../scripts/validate-env';

const PORT = process.env.API_PORT || 3001;

// ── Restart coordination with the Windows supervisor ──
// Windows has no POSIX SIGTERM semantics (child.kill() hard-terminates), so
// graceful restarts go through a drain file instead of signals:
//   supervisor/hotfix writes  runtime/drain.request
//   server stops accepting, finishes in-flight requests, then exits
// The supervisor waits for the exit before starting the new process, so no
// request is ever severed mid-flight (no ERR_CONNECTION_RESET for clients).
// runtime/server-ready.json lets the watchdog tell "just started, warming up"
// apart from "actually stuck", so it stops restart-flapping during deploys.
const RUNTIME_DIR = path.join(process.cwd(), 'runtime');
const DRAIN_FILE = path.join(RUNTIME_DIR, 'drain.request');
const READY_FILE = path.join(RUNTIME_DIR, 'server-ready.json');
const SERVER_STARTED_AT = new Date().toISOString();
let draining = false;

const writeReadyFile = () => {
    try {
        fs.mkdirSync(RUNTIME_DIR, { recursive: true });
        fs.writeFileSync(READY_FILE, JSON.stringify({
            pid: process.pid,
            port: Number(PORT),
            startedAt: SERVER_STARTED_AT,
            updatedAt: new Date().toISOString(),
        }));
    } catch {
        // Best effort only — never fail startup over a heartbeat file.
    }
};

const server = http.createServer(app);

const shouldStartWhatsAppEngine = () => {
    const provider = String(process.env.WHATSAPP_PROVIDER ?? 'whatsapp-web.js').toLowerCase().trim();
    if (provider === 'disabled' || provider === 'off' || provider === 'false') return false;
    // صريح أو افتراضي: شغّل المحرك الداخلي ما لم يُعطَّل صراحةً، حتى يظهر QR للربط.
    return process.env.ENABLE_WHATSAPP_WEB === 'true'
        || provider === 'openwa'
        || provider === 'web'
        || provider === 'whatsapp-web'
        || provider === 'whatsapp-web.js'
        || provider === ''
        || provider === 'true'
        || provider === 'enabled';
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
    // Ensure hotfix schema additions exist before traffic arrives (order_items.size_id
    // is referenced by consumption/movement reports the moment the server is up).
    import('./controllers/orderController')
        .then(m => (m as any).ensureOrderItemsSizeIdColumn?.())
        .catch((err: any) => console.error('Startup schema ensure failed:', err?.message));
    import('./controllers/orderController')
        .then(m => (m as any).ensureOrderScheduledColumn?.())
        .catch((err: any) => console.error('Startup scheduled column ensure failed:', err?.message));
    import('./services/scheduledOrderService')
        .then(m => (m as any).scheduledOrderService?.start?.())
        .catch((err: any) => console.error('Scheduled-order dispatcher failed to start:', err?.message));

    const HOST = process.env.HOST || '0.0.0.0';
    server.listen(Number(PORT), HOST, () => {
        console.log(`Coduis Zen Backend - Production Modular Foundation - running on ${HOST}:${PORT}`);
        writeReadyFile();
        setInterval(writeReadyFile, 20_000);
    });

    if (shouldStartWhatsAppEngine()) {
        import('./services/whatsappService')
            .then(w => w.whatsappService.initialize())
            .catch(err => console.error('Could not start WhatsApp engine:', err));
    } else {
        console.log('WhatsApp Web engine disabled (WHATSAPP_PROVIDER=disabled). Set WHATSAPP_PROVIDER=whatsapp-web.js to enable QR pairing.');
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
    import('./services/deploymentHeartbeatService').then(d => d.deploymentHeartbeatService.start(30000));
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

// ── Stability guards: a single stray async throw must NEVER take the whole
// API down (that is the ERR_CONNECTION_REFUSED → RESET → 500 storm: the
// process dies, the port closes, the watchdog restarts, and every endpoint
// 500s while the DB pool reconnects). Log loudly, keep serving.
process.on('unhandledRejection', (reason: any) => {
    console.error('[FATAL-GUARD] unhandledRejection (server kept alive):', reason?.stack || reason?.message || reason);
});

process.on('uncaughtException', (error: Error) => {
    console.error('[FATAL-GUARD] uncaughtException (server kept alive):', error?.stack || error?.message || error);
});
