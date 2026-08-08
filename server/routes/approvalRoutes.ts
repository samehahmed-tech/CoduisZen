import { Router } from 'express';
import * as approvalController from '../controllers/approvalController';

const router = Router();

router.get('/', approvalController.getApprovals);
router.post('/', approvalController.createApproval);
router.post('/verify-pin', approvalController.verifyManagerPin);
router.post('/verify-password', approvalController.verifyManagerPassword);
router.put('/:id/reject', approvalController.rejectApproval);

export default router;
