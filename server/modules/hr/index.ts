import { Router } from 'express';
import hrRoutes from '../../routes/hrRoutes';
import hrExtendedRoutes from '../../routes/hrExtendedRoutes';
import attendanceOpsRoutes from '../../routes/attendanceOpsRoutes';
import admsRoutes from '../../routes/admsRoutes';
import userRoutes from '../../routes/userRoutes';

const router = Router();

router.use('/', hrRoutes);
router.use('/extended', hrExtendedRoutes);
router.use('/attendance', attendanceOpsRoutes);
router.use('/biometrics', admsRoutes);
router.use('/users', userRoutes);

export default router;
