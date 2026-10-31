import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const attendanceRoutes = readFileSync(
    fileURLToPath(new URL('../server/routes/attendanceOpsRoutes.ts', import.meta.url)),
    'utf8',
);
const hrExtendedRoutes = readFileSync(
    fileURLToPath(new URL('../server/routes/hrExtendedRoutes.ts', import.meta.url)),
    'utf8',
);

describe('owner branch isolation contract', () => {
    it('does not bypass attendance branch scope for OWNER', () => {
        expect(attendanceRoutes).toContain("if (String(req.user?.role || '').toUpperCase() === 'SUPER_ADMIN') return next();");
        expect(attendanceRoutes).not.toContain("['SUPER_ADMIN', 'OWNER'].includes(String(req.user?.role || '').toUpperCase())");
    });

    it('does not bypass HR extended branch scope for OWNER', () => {
        expect(hrExtendedRoutes).toContain("if (String(req.user?.role || '').toUpperCase() === 'SUPER_ADMIN') return next();");
        expect(hrExtendedRoutes).not.toContain("['SUPER_ADMIN', 'OWNER'].includes(String(req.user?.role || '').toUpperCase())");
        expect(hrExtendedRoutes).not.toContain("if (role === 'SUPER_ADMIN' || role === 'OWNER') return null;");
    });
});
