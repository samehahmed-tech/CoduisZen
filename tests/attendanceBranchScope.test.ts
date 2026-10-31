import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const serviceSource = readFileSync(
    fileURLToPath(new URL('../server/services/attendanceOpsService.ts', import.meta.url)),
    'utf8',
);
const routeSource = readFileSync(
    fileURLToPath(new URL('../server/routes/attendanceOpsRoutes.ts', import.meta.url)),
    'utf8',
);

describe('attendance resource branch scope contract', () => {
    it('checks device ownership before update and mapping writes', () => {
        expect(serviceSource).toContain('async upsertDevice(input:');
        expect(serviceSource).toContain("throw new Error('BRANCH_MISMATCH')");
        expect(serviceSource).toContain('async upsertDeviceMapping(input:');
        expect(serviceSource).toContain('employee.branchId !== scopeBranchId');
        expect(serviceSource).toContain('async deleteDevice(deviceId: string, deletedBy?: string | null, scopeBranchId?: string)');
        expect(serviceSource).toContain('async deactivateDeviceMapping(id: number, scopeBranchId?: string)');
    });

    it('passes the authenticated effective branch into the service boundary', () => {
        expect(routeSource).toContain('upsertDevice(req.body, req.effectiveBranchId)');
        expect(routeSource).toContain('upsertDeviceMapping(req.body, req.effectiveBranchId)');
        expect(routeSource).toContain('deleteDevice(String(req.params.id), req.user?.id || \'system\', req.effectiveBranchId)');
        expect(routeSource).toContain('deactivateDeviceMapping(Number(req.params.id), req.effectiveBranchId)');
    });

    it('never accepts client-supplied actor identities for attendance mutations', () => {
        expect(routeSource).not.toContain('req.body?.resolvedBy');
        expect(routeSource).not.toContain('req.body?.requestedBy');
        expect(routeSource).not.toContain('req.body.requestedBy');
        expect(routeSource).not.toContain('req.body.approvedBy');
        expect(routeSource).not.toContain('req.body.resolvedBy');
        expect(routeSource).not.toContain('req.body.escalatedBy');
        expect(routeSource).not.toContain('req.body.closedBy');
        expect(routeSource).toContain('requestedBy: req.user?.id || \'system\'');
        expect(routeSource).toContain("const approvedBy = req.user?.id || 'system';");
        expect(routeSource).toContain("const resolvedBy = req.user?.id || 'system';");
        expect(routeSource).toContain("const escalatedBy = req.user?.id || 'system';");
        expect(routeSource).toContain("const closedBy = req.user?.id || 'system';");
    });
});
