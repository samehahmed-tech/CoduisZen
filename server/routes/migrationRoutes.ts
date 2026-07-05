import { Router } from 'express';
import { csvMigrationService } from '../services/csvMigrationService';

const router = Router();

router.post('/:entity/upload', async (req, res, next) => {
   try {
       const branchId = req.query.branchId as string;
       const entity = req.params.entity; // 'users', 'attendance'
       
       // Because this is a lightweight API, we assume the CSV content is posted as text/plain body,
       // or a base64 encoded string if it's large. For simplicity, we read raw body:
       const csvContent = req.body; 

       if (!csvContent || typeof csvContent !== 'string') {
           return res.status(400).json({ error: 'Missing raw CSV text body' });
       }

       if (entity === 'users') {
           const result = await csvMigrationService.importUsers(branchId, csvContent);
           return res.json(result);
       } else if (entity === 'attendance') {
           const result = await csvMigrationService.importAttendance(branchId, csvContent);
           return res.json(result);
       } else {
           return res.status(400).json({ error: 'Unsupported migration entity' });
       }
   } catch (err) {
       next(err);
   }
});

export default router;
