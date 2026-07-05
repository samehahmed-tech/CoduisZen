import { Router, Request, Response, NextFunction } from 'express';
import { zktecoAdmsService } from '../services/zktecoAdmsService';
import logger from '../utils/logger';

const router = Router();

// ZKTeco devices send raw textual payloads, not JSON. We must parse body as raw text.
import bodyParser from 'body-parser';
const rawParser = bodyParser.text({ type: '*/*', limit: '10mb' });

/**
 * 1. ADMS Initialization Endpoint
 * Endpoint: GET /iclock/cdata or /iclock/getrequest
 * Handshake route for ZKTeco ADMS devices. The device first checks in with its Serial Number (SN).
 */
router.get('/cdata', (req: Request, res: Response) => {
    const sn = req.query.SN as string;
    if (!sn) return res.status(400).send('BAD REQUEST');
    
    // Respond "OK" to tell the device the server is ready to track it.
    // The device uses this to verify connectivity.
    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send('OK');
});

router.get('/getrequest', (req: Request, res: Response) => {
    // Similar handshake logic. Return OK.
    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send('OK');
});

/**
 * 2. ADMS Payload Push Endpoint
 * Endpoint: POST /iclock/cdata
 * The device posts attendance logs here in raw Tab-Separated Values (TSV) format.
 * Format usually: SN=...&table=ATTLOG&...
 * Body format: "uid \t timestamp \t status \t verifyMode"
 */
router.post('/cdata', rawParser, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const sn = req.query.SN as string;
        const table = req.query.table as string;
        const rawBody = req.body as string;

        if (!sn) {
            return res.status(400).send('UNKNOWN DEVICE');
        }

        // We specifically listen for ATTLOG table (Attendance Logs)
        if (table === 'ATTLOG' && rawBody) {
            // Process the raw ADMS payroll lines in service
            await zktecoAdmsService.processPushPayload(sn, rawBody);
        } else if (table === 'OPERLOG') {
            // Can process operational logs later (enrollment, etc)
            logger.info(`Received OPERLOG from device ${sn}`);
        }

        // Must return OK immediately or the device will buffer and retry
        res.setHeader('Content-Type', 'text/plain');
        return res.status(200).send('OK');

    } catch (err: any) {
        logger.error({ err: err.message }, 'ADMS Webhook Processing Error');
        // If we fail, return HTTP 500 so the device resends
        return res.status(500).send('ERROR');
    }
});

// Middleware hook for Express app
export default router;
