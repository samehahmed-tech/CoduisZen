import 'dotenv/config';
import { and, eq, sql } from 'drizzle-orm';
import { closeDatabase, db } from '../server/db';
import { attendanceDevices } from '../src/db/schema';
import attendanceOpsService from '../server/services/attendanceOpsService';
import zktecoConnectorService from '../server/services/zktecoConnectorService';

type DeviceRow = typeof attendanceDevices.$inferSelect;

const branchIdArg = process.argv.find(arg => arg.startsWith('--branch='))?.split('=')[1]?.trim() || '';

async function main() {
    const where = and(
        eq(attendanceDevices.isActive, true),
        eq(attendanceDevices.sourceType, 'BIOMETRIC_ZK'),
        branchIdArg ? eq(attendanceDevices.branchId, branchIdArg) : undefined,
    );

    const devices = await db.select().from(attendanceDevices).where(where);
    const bridgeDevices = devices.filter(device => device.communicationMode === 'BRANCH_BRIDGE');
    const directDevices = devices.filter(device => device.communicationMode !== 'BRANCH_BRIDGE' && device.communicationMode !== 'USB');
    const skippedDevices = devices.filter(device => device.communicationMode === 'USB' || !device.isActive);

    console.log(`Resetting attendance data for ${branchIdArg || 'ALL_BRANCHES'}...`);
    try {
        await attendanceOpsService.clearAllAttendanceData(branchIdArg || undefined);
    } catch (error) {
        if (branchIdArg) throw error;
        console.warn('Standard clear failed, using TRUNCATE fallback for full attendance reset...');
        await db.execute(sql.raw(`
            TRUNCATE TABLE
                attendance_corrections,
                attendance_exceptions,
                attendance_sessions,
                attendance_raw_logs,
                attendance_sync_runs,
                attendance
            CASCADE
        `));
    }

    const directResults: Array<Record<string, any>> = [];
    for (const device of directDevices) {
        try {
            const result = await zktecoConnectorService.syncSingleDevice(device.id);
            directResults.push({
                deviceId: device.id,
                name: device.name,
                mode: device.communicationMode || 'LAN',
                success: true,
                logsReceived: result.logsReceived,
                logsIngested: result.logsIngested,
                logsSkipped: result.logsSkipped,
                unknownEmployees: result.unknownEmployees,
                exceptionsRaised: result.exceptionsRaised,
            });
        } catch (error: any) {
            directResults.push({
                deviceId: device.id,
                name: device.name,
                mode: device.communicationMode || 'LAN',
                success: false,
                error: error?.message || 'DIRECT_SYNC_FAILED',
            });
        }
    }

    const bridgeResults: Array<Record<string, any>> = [];
    for (const device of bridgeDevices) {
        try {
            const command = await attendanceOpsService.requestBridgeDeviceSync(device.id, 'system-reset', {});
            bridgeResults.push({
                deviceId: device.id,
                name: device.name,
                gatewayId: device.branchGatewayId,
                success: true,
                commandId: command.commandId,
                status: command.status,
            });
        } catch (error: any) {
            bridgeResults.push({
                deviceId: device.id,
                name: device.name,
                gatewayId: device.branchGatewayId,
                success: false,
                error: error?.message || 'BRIDGE_QUEUE_FAILED',
            });
        }
    }

    const summary = {
        ok: true,
        branchId: branchIdArg || null,
        cleared: true,
        totals: {
            devices: devices.length,
            direct: directDevices.length,
            bridge: bridgeDevices.length,
            skipped: skippedDevices.length,
            directSucceeded: directResults.filter(item => item.success).length,
            directFailed: directResults.filter(item => !item.success).length,
            bridgeQueued: bridgeResults.filter(item => item.success).length,
            bridgeFailed: bridgeResults.filter(item => !item.success).length,
        },
        directResults,
        bridgeResults,
        skippedDevices: skippedDevices.map((device: DeviceRow) => ({
            deviceId: device.id,
            name: device.name,
            mode: device.communicationMode,
        })),
    };

    console.log(JSON.stringify(summary, null, 2));
}

main()
    .catch(async (error) => {
        console.error(JSON.stringify({
            ok: false,
            error: error?.message || 'RESET_ATTENDANCE_FAILED',
            stack: error?.stack || null,
        }, null, 2));
        process.exitCode = 1;
    })
    .finally(async () => {
        await closeDatabase();
    });
