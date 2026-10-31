import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (relative: string) => fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8');

describe('payroll audit trail contract', () => {
    it('uses the signed audit service for every payroll cycle state mutation', () => {
        const source = read('server/routes/hrExtendedRoutes.ts');

        expect(source).toContain("import { createSignedAuditLog } from '../services/auditService';");
        expect(source).toContain("'PAYROLL_CYCLE_CREATED'");
        expect(source).toContain("'PAYROLL_CYCLE_CALCULATED'");
        expect(source).toContain("'PAYROLL_CYCLE_CLOSED'");
        expect(source).toContain("'PAYROLL_CYCLE_REOPENED'");
        expect(source.match(/auditPayrollMutation\(/g)?.length).toBeGreaterThanOrEqual(4);
    });

    it('binds audit identity to the authenticated actor and avoids salary or raw reason payloads', () => {
        const source = read('server/routes/hrExtendedRoutes.ts');

        expect(source).toContain('userId: req.user?.id || \'system\'');
        expect(source).toContain('userRole: req.user?.role');
        expect(source).toContain('requestId: req.requestId');
        expect(source).toContain("reasonLength: String(req.body.reason).length");
        expect(source).not.toContain('salary: req.body');
        expect(source).not.toContain('bankAccount: req.body');
    });
});
