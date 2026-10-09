import { Router } from 'express';
import { getMapkitToken, isMapkitConfigured } from '../services/mapkitService';
import logger from '../utils/logger';

const log = logger.child({ route: 'maps' });

const router = Router();

// Short-lived Apple MapKit JS token for authenticated clients.
// Mounted under /api (global auth guard) — no extra role gate: every
// logged-in screen that shows a map needs it (dispatch, drivers, POS...).
router.get('/apple-token', (_req, res) => {
    try {
        if (!isMapkitConfigured()) {
            log.warn('apple-token requested but MAPKIT_* env missing');
            return res.status(503).json({ error: 'MAPKIT_NOT_CONFIGURED' });
        }
        const out = getMapkitToken();
        log.info({ expiresAt: out.expiresAt }, 'apple-token issued');
        res.json(out);
    } catch (error: any) {
        log.error({ err: error?.message }, 'apple-token failed');
        res.status(500).json({ error: error?.message || 'MAPKIT_TOKEN_FAILED' });
    }
});

export default router;
