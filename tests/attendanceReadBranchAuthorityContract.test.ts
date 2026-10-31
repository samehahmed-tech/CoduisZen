import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('attendance read branch authority contract', () => {
    it('defines one server-resolved branch selector for non-super-admin reads', () => {
        const source = fs.readFileSync('server/routes/attendanceOpsRoutes.ts', 'utf8');
        expect(source).toContain('const scopedBranchId = (req: Request)');
        expect(source).toContain('req.effectiveBranchId;');
        expect(source).toContain('listDevices(scopedBranchId(req))');
        expect(source).toContain('listGeofences(scopedBranchId(req))');
        expect(source).toContain('getBridgeMonitor(scopedBranchId(req))');
        expect(source).toContain('scopedBranchId(req),');
    });
});
