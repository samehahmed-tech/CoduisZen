import { Router } from 'express';
import { bridgeConnect } from '../controllers/printGatewayController.js';
import { requirePrintGatewayToken } from '../middleware/printGatewayAuth.js';

const router = Router();

router.get('/bridge/connect', requirePrintGatewayToken, bridgeConnect);

export default router;
