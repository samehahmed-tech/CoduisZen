import { afterEach, describe, expect, it } from 'vitest';
import { validateBridgeDeviceScope } from '../server/utils/bridgeScope';
import { getAttendanceBridgeToken } from '../server/utils/bridgeToken';

describe('attendance bridge credential boundary', () => {
    afterEach(() => {
        delete process.env.ATTENDANCE_BRIDGE_TOKEN;
        delete process.env.PRINT_GATEWAY_TOKEN;
    });

    it('does not reuse the print gateway credential', () => {
        process.env.PRINT_GATEWAY_TOKEN = 'print-only-secret';
        expect(getAttendanceBridgeToken()).toBe('');
    });

    it('uses only the dedicated attendance credential', () => {
        process.env.PRINT_GATEWAY_TOKEN = 'print-only-secret';
        process.env.ATTENDANCE_BRIDGE_TOKEN = 'attendance-secret';
        expect(getAttendanceBridgeToken()).toBe('attendance-secret');
    });
});

describe('validateBridgeDeviceScope', () => {
    it('rejects a device id reused from another branch', () => {
        expect(validateBridgeDeviceScope({
            existingBranchId: 'branch-a',
            requestedBranchId: 'branch-b',
            requestedGatewayId: 'gateway-b',
        })).toEqual({ ok: false, code: 'DEVICE_BRANCH_MISMATCH' });
    });

    it('rejects a device claimed by another gateway', () => {
        expect(validateBridgeDeviceScope({
            existingBranchId: 'branch-a',
            requestedBranchId: 'branch-a',
            existingGatewayId: 'gateway-a',
            requestedGatewayId: 'gateway-b',
        })).toEqual({ ok: false, code: 'GATEWAY_DEVICE_MISMATCH' });
    });

    it('allows a matching or previously unbound scope', () => {
        expect(validateBridgeDeviceScope({ requestedBranchId: 'branch-a' })).toEqual({ ok: true });
        expect(validateBridgeDeviceScope({ existingBranchId: 'branch-a', requestedBranchId: 'branch-a', existingGatewayId: 'g', requestedGatewayId: 'g' })).toEqual({ ok: true });
    });
});
