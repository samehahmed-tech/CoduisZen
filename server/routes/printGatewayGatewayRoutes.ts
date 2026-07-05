import { Router } from 'express';
import { ackJob, claimJob, failJob, gatewayHealth } from '../controllers/printGatewayController';

const router = Router();

router.get('/health', gatewayHealth);
router.post('/claim', claimJob);
router.post('/:jobId/ack', ackJob);
router.post('/:jobId/fail', failJob);

export default router;
