import { inventoryService } from '../services/inventoryService';

/**
 * Script designed to be run daily via a real CRON scheduler (e.g. Linux cron, PM2 cron, or Heroku scheduler)
 * It will run the FEFO expiry check and update the inventoryBatches tables.
 */
const runExpiryCheck = async () => {
    console.log(`[${new Date().toISOString()}] Starting daily inventory batch expiry check...`);
    try {
        await inventoryService.markExpiredBatches();
        console.log(`[${new Date().toISOString()}] Expiry check completed successfully.`);
        process.exit(0);
    } catch (err) {
        console.error(`[${new Date().toISOString()}] Expiry check failed:`, err);
        process.exit(1);
    }
};

runExpiryCheck();
