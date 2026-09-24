import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { enqueuePrintJob, claimNextPrintJob } from '../server/services/printQueueService';
import { markBridgePoll } from '../server/services/printerBridgeService';
import { pool } from '../server/db';
import { db } from '../server/db';
import { branches } from '../src/db/schema';

const BRANCH = 'test-capability-branch';
const GW_A = 'gw-test-cashier';
const GW_B = 'gw-test-server';
const USB_ADDRESS = 'windows:TEST-USB-80C';
const NET_ADDRESS = '192.168.9.9:9100';

const cleanup = async () => {
    await pool.query(`IF OBJECT_ID('print_jobs','U') IS NOT NULL DELETE FROM print_jobs WHERE branch_id = $1`, [BRANCH]);
    await pool.query(`IF OBJECT_ID('bridge_printers','U') IS NOT NULL DELETE FROM bridge_printers WHERE gateway_id IN ($1, $2)`, [GW_A, GW_B]);
    await db.delete(branches).where(eq(branches.id, BRANCH));
};

const ensureBranch = async () => {
    await db.insert(branches).values({ id: BRANCH, name: 'Capability Test Branch' });
};

const claim = (gatewayId: string, printers: string[]) =>
    claimNextPrintJob({ branchId: BRANCH, gatewayId, claimUnassigned: true, globalClaim: true, printers });

describe('capability-based print job claiming', () => {
    beforeEach(async () => {
        await cleanup();
        await ensureBranch();
    });
    afterEach(async () => { await cleanup(); });

    it('routes an unbound USB job only to the bridge that owns the printer', async () => {
        await markBridgePoll(GW_A, BRANCH, [USB_ADDRESS, `windows:${USB_ADDRESS}`]);
        await enqueuePrintJob({ branchId: BRANCH, type: 'RECEIPT', content: 'usb test', printerAddress: USB_ADDRESS, printerType: 'LOCAL' });

        // The other bridge (no such printer) must NOT claim it.
        const wrong = await claim(GW_B, [NET_ADDRESS]);
        expect(wrong).toBeNull();

        // The owning bridge claims it.
        const right = await claim(GW_A, [USB_ADDRESS]);
        expect(right?.claimed_by).toBe(GW_A);
    });

    it('lets any bridge claim a nowhere-registered printer after the grace period', async () => {
        // NOTE: NETWORK/LAN jobs are intentionally claimable immediately by
        // design (no stale-job wait), so the grace window is exercised with a
        // LOCAL printer that no bridge registered.
        const NOWHERE_USB = 'windows:NOWHERE-PRINTER-80C';
        await markBridgePoll(GW_A, BRANCH, [USB_ADDRESS]);
        await enqueuePrintJob({ branchId: BRANCH, type: 'KITCHEN', content: 'usb nowhere test', printerAddress: NOWHERE_USB, printerType: 'LOCAL' });

        // GW_B does NOT own NOWHERE_USB (different capability list). Within the
        // 30s grace window the printer is registered nowhere, so it waits —
        // giving the real owner's bridge time to poll first.
        const early = await claim(GW_B, ['OTHER-PRINTER']);
        expect(early).toBeNull();

        // Age the job past the grace window.
        await pool.query(`UPDATE print_jobs SET created_at = DATEADD(SECOND, -45, GETDATE()) WHERE branch_id = $1`, [BRANCH]);
        const late = await claim(GW_B, ['OTHER-PRINTER']);
        expect(late?.claimed_by).toBe(GW_B);
    });

    it('claims immediately when the printer IS registered by the claiming bridge', async () => {
        await markBridgePoll(GW_B, BRANCH, [NET_ADDRESS]);
        await enqueuePrintJob({ branchId: BRANCH, type: 'KITCHEN', content: 'net instant', printerAddress: NET_ADDRESS, printerType: 'NETWORK' });
        const job = await claim(GW_B, [NET_ADDRESS]);
        expect(job?.claimed_by).toBe(GW_B);
    });

    it('still honors explicit gateway targeting over capabilities', async () => {
        await markBridgePoll(GW_A, BRANCH, [USB_ADDRESS]);
        await enqueuePrintJob({ branchId: BRANCH, type: 'RECEIPT', content: 'targeted', printerAddress: USB_ADDRESS, printerType: 'LOCAL', targetGatewayId: GW_B });

        const job = await claim(GW_B, [NET_ADDRESS]);
        expect(job?.claimed_by).toBe(GW_B);
    });

    it('keeps legacy behavior for bridges without capability data', async () => {
        await enqueuePrintJob({ branchId: BRANCH, type: 'RECEIPT', content: 'legacy', printerAddress: USB_ADDRESS, printerType: 'LOCAL' });
        const job = await claimNextPrintJob({ branchId: BRANCH, gatewayId: GW_B, claimUnassigned: true, globalClaim: true });
        expect(job?.claimed_by).toBe(GW_B);
    });

    it('falls back to any bridge when the owning gateway registration goes stale', async () => {
        await markBridgePoll(GW_A, BRANCH, [USB_ADDRESS]);
        // Simulate the owning bridge disappearing over an hour ago.
        await pool.query(`UPDATE bridge_printers SET last_seen_at = DATEADD(HOUR, -2, GETDATE()) WHERE gateway_id = $1`, [GW_A]);
        await enqueuePrintJob({ branchId: BRANCH, type: 'RECEIPT', content: 'stale owner', printerAddress: USB_ADDRESS, printerType: 'LOCAL' });
        await pool.query(`UPDATE print_jobs SET created_at = DATEADD(SECOND, -45, GETDATE()) WHERE branch_id = $1`, [BRANCH]);

        const job = await claim(GW_B, [NET_ADDRESS]);
        expect(job?.claimed_by).toBe(GW_B);
    });
});
