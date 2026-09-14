import { Router } from 'express';
import {
    sendMail, getInbox, getSent, getMessage, getMailThread,
    markMailRead, toggleMailStar, archiveMail,
    getMailUnreadCount, getMailDirectory, deleteSentMail,
} from '../controllers/mailController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.use(authenticateToken);

router.post('/send', sendMail);
router.get('/inbox', getInbox);
router.get('/sent', getSent);
router.get('/message/:id', getMessage);
router.get('/thread/:id', getMailThread);
router.post('/:id/read', markMailRead);
router.post('/:id/star', toggleMailStar);
router.post('/:id/archive', archiveMail);
router.get('/unread-count', getMailUnreadCount);
router.get('/directory', getMailDirectory);
router.delete('/sent/:id', deleteSentMail);

export default router;
