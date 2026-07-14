import logger from '../utils/logger';
import { createVerifiedDatabaseBackup } from './databaseBackupService';

export const backupCronService = {
    startDailyBackup(hourOfDay = 3) {
        if (process.env.NODE_ENV !== 'production') {
            logger.info('Daily DB backup cron is disabled outside production');
            return;
        }

        let lastSuccessfulDate = '';
        logger.info(`Daily verified DB backup scheduled for ${hourOfDay}:00`);

        const runIfDue = async () => {
            const now = new Date();
            const date = now.toISOString().slice(0, 10);
            if (now.getHours() !== hourOfDay || lastSuccessfulDate === date) return;

            try {
                const result = await createVerifiedDatabaseBackup();
                lastSuccessfulDate = date;
                logger.info({ filename: result.filename, bytes: result.bytes }, 'Scheduled verified DB backup completed');
            } catch (error) {
                logger.error({ error }, 'Scheduled DB backup failed');
            }
        };

        void runIfDue();
        setInterval(() => void runIfDue(), 30 * 60 * 1000);
    },
};
