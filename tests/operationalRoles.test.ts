import { describe, expect, it, vi } from 'vitest';
import { requireRoles } from '../server/middleware/auth';
import { POS_FLOOR_ROLES } from '../server/utils/operationalRoles';

const runGate = (roles: readonly string[] | string[], userRole: string) => {
    const next = vi.fn();
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const req = { user: { id: 'u1', role: userRole, permissions: [] } } as any;
    (Array.isArray(roles) ? requireRoles(...roles) : (roles as any))(
        req,
        res,
        next,
    );
    return { next, res };
};

describe('POS floor role coverage (shift/open-shift regression)', () => {
    it('lets CAFE_ADMIN, OWNER, GENERAL_MANAGER, CASHIER_MANAGER and CAPTAIN through the shared floor gate', () => {
        for (const role of ['CAFE_ADMIN', 'OWNER', 'GENERAL_MANAGER', 'CASHIER_MANAGER', 'CAPTAIN', 'CASHIER', 'WAITER', 'BRANCH_MANAGER', 'SUPER_ADMIN']) {
            const { next, res } = runGate(POS_FLOOR_ROLES, role);
            expect(next, role).toHaveBeenCalledTimes(1);
            expect(res.status, role).not.toHaveBeenCalled();
        }
    });

    it('still blocks back-office roles from floor operations', () => {
        for (const role of ['DRIVER', 'KITCHEN_STAFF', 'HR_MANAGER', 'ACCOUNTANT', 'TECH_SUPPORT']) {
            const { next, res } = runGate(POS_FLOOR_ROLES, role);
            expect(next, role).not.toHaveBeenCalled();
            expect(res.status, role).toHaveBeenCalledWith(403);
        }
    });

    it('keeps the legacy MANAGER alias in the group', () => {
        expect(POS_FLOOR_ROLES).toContain('MANAGER');
    });
});
