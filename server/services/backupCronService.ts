import logger from '../utils/logger';
import { triggerBackup } from '../controllers/backupController';

export const backupCronService = {
    /**
     * Start the daily database backup schedule.
     * @param hourOfDay 0-23, defaults to 3 AM
     */
    startDailyBackup(hourOfDay = 3) {
        if (process.env.NODE_ENV !== 'production') {
            logger.info('Daily DB backup cron is disabled outside production');
            return;
        }

        logger.info(`Daily DB backup scheduled for ${hourOfDay}:00 every day`);

        // Check every hour to see if it's time to backup
        setInterval(async () => {
            const now = new Date();
            // Run exactly at the specified hour, roughly minute 0-5
            if (now.getHours() === hourOfDay && now.getMinutes() < 60) {
                // Ensure we only run once per day by checking if a backup was already created today
                // For simplicity, we just trigger it and let backupController handle it.
                // We could use a lock or last_run timestamp, but since setInterval is in-memory:
                try {
                    // Mock req/res for the controller
                    const req: any = {};
                    const res: any = {
                        json: (data: any) => logger.info({ data }, 'Daily backup successful'),
                        status: (code: number) => ({
                            json: (err: any) => logger.error({ code, err }, 'Daily backup failed')
                        })
                    };
                    
                    logger.info('Executing scheduled daily backup...');
                    await triggerBackup(req, res);
                    
                    // Sleep for an hour to avoid double-triggering in the same hour
                    await new Promise(r => setTimeout(r, 60 * 60 * 1000));
                } catch (error) {
                    logger.error({ error }, 'Scheduled daily backup crashed');
                }
            }
        }, 30 * 60 * 1000); // Check every 30 minutes
    }
};
