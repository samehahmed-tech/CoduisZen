/**
 * ZKTeco ADMS (Push Model) & Attendance Data Normalization Service
 * ================================================================
 * This service implements the server side of the ZKTeco ADMS / iClock HTTP protocol.
 * The push model allows biometric devices to perform real-time check-ins without
 * the server actively opening TCP/UDP connections. This avoids firewall issues
 * and scales across hundreds of remote devices (100K+ logs).
 * 
 * Flow: Device -> HTTP POST /iclock/cdata -> ZktecoAdmsService (Parser & Batcher) -> Database & Socket
 */

import { db } from '../db';
import { attendanceRawLogs, attendanceDevices, attendanceDeviceMappings } from '../../src/db/schema';
import { eq, or } from 'drizzle-orm';
import logger from '../utils/logger';
import { getIO } from '../socket';

export interface NormalizedLog {
    userId: string;
    timestamp: Date;
    type: 'check-in' | 'check-out';
    deviceId: string;
    branchId: string;
}

class ZktecoAdmsService {
    // We use a modest batching mechanism to prevent DB locks when a device comes online 
    // and suddenly pushes 10,000 logs in a single burst.
    private logBatch: NormalizedLog[] = [];
    private batchTimer: NodeJS.Timeout | null = null;
    private BATCH_SIZE_LIMIT = 500;
    private BATCH_TIME_WINDOW_MS = 500; // 500ms aggregation window

    /**
     * Process raw ZKTeco ADMS payload
     * @param sn Serial Number of the device pushing the data
     * @param body Raw TSV string payload from the device (userId \t timestamp \t status \t type)
     */
    public async processPushPayload(sn: string, body: string): Promise<void> {
        // Find mapped device by SN
        const [device] = await db.select().top(1).from(attendanceDevices)
            .where(or(
                eq(attendanceDevices.serialNumber, sn),
                eq(attendanceDevices.code, sn),
                eq(attendanceDevices.name, sn),
            ));

        if (!device) {
            logger.warn(`Device SN ${sn} pushed data but is not registered in system.`);
            return;
        }

        // Defensive parsing
        const lines = body.split(/\r?\n/).filter(line => line.trim().length > 0);
        
        for (const line of lines) {
            const parts = line.split('\t');
            if (parts.length < 2) continue; // Malformed row

            // Typical format:
            // 1) UserID
            // 2) YYYY-MM-DD HH:mm:ss
            // 3) status (0: In, 1: Out, etc)
            // 4) VerifyMode (1: Fingerprint, 15: Face)
            const rawUserId = parts[0].trim();
            const timestampString = parts[1].trim();
            const statusInt = parts.length > 2 ? parseInt(parts[2].trim(), 10) || 0 : 0;
            
            const timestamp = new Date(timestampString);
            if (isNaN(timestamp.getTime())) continue;

            const type = statusInt % 2 === 0 ? 'check-in' : 'check-out';

            const normalized: NormalizedLog = {
                userId: rawUserId,
                timestamp,
                type,
                deviceId: device.id,
                branchId: device.branchId,
            };

            this.queueForProcessing(normalized);
        }
    }

    /**
     * Pushes logs into a local buffer. Flushes automatically based on time window or size limit.
     */
    private queueForProcessing(item: NormalizedLog) {
        this.logBatch.push(item);

        if (this.logBatch.length >= this.BATCH_SIZE_LIMIT) {
            this.flushBatch();
        } else if (!this.batchTimer) {
            this.batchTimer = setTimeout(() => this.flushBatch(), this.BATCH_TIME_WINDOW_MS);
        }
    }

    /**
     * Flush normalized logs to persistence layer and broadcast via Socket API
     */
    private async flushBatch() {
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }

        if (this.logBatch.length === 0) return;

        // Take a snapshot
        const batch = [...this.logBatch];
        this.logBatch = [];

        try {
            logger.info(`Flushing ${batch.length} ADMS normalized logs to DB.`);
            
            // Real-Time Socket Broadcast
            try {
                const io = getIO();
                if (io) {
                    io.emit('biometrics:logs_arrived', {
                        count: batch.length,
                        latestLogs: batch.slice(0, 5),
                    });
                }
            } catch (ioErr) {
                // Ignore if socket not ready
            }

            // We iterate and process. To optimize scaling, we can decouple this into BullMQ or Redis stream
            import('./attendanceOpsService').then(opsService => {
                const processPromises = batch.map(log => 
                    opsService.attendanceOpsService.ingestRawLog({
                        branchId: log.branchId,
                        sourceType: 'BIOMETRIC_ADMS',
                        eventType: log.type === 'check-in' ? 'IN' : 'OUT',
                        occurredAt: log.timestamp,
                        deviceId: log.deviceId,
                        deviceUserId: log.userId,
                        employeeIdentifier: log.userId,
                        rawPayload: { original: 'ADMS' }
                    }).catch(err => {
                        // Suppress duplicate throw errors at queue level
                    })
                );
                Promise.all(processPromises);
            });

        } catch (err: any) {
            logger.error(`Batch flushing failed: ${err.message}`);
        }
    }

}

export const zktecoAdmsService = new ZktecoAdmsService();
