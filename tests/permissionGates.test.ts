import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';

let app: any;
let db: typeof import('../server/db')['db'];
import { branches, users } from '../src/db/schema';

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const F = {
    branchId: `test-permgate-branch-${suffix}`,
    password: 'Test123!',
};

const mkUser = (tag: string, role: string, permissions: string[]) => ({
    id: `test-permgate-${tag}-${suffix}`,
    name: `Perm Gate ${tag}`,
    email: `permgate-${tag}-${suffix}@restoflow.local`,
    role,
    permissions,
});

async function loginAs(email: string) {
    const res = await request(app).post('/api/auth/login').send({ email, password: F.password });
    expect(res.status).toBe(200);
    return res.body as { token: string; refreshToken: string };
}

const decodeToken = (token: string) =>
    jwt.verify(token, process.env.JWT_SECRET as string) as any;

describe('permission-screen grants are enforced server-side', () => {
    beforeEach(async () => {
        if (!app || !db) {
            const appModule = await import('../server/app');
            app = appModule.default;
            const dbModule = await import('../server/db');
            db = dbModule.db;
        }
        await db.insert(branches).values({
            id: F.branchId, name: 'Perm Gate Branch', isActive: true,
        }).onConflictDoNothing();

        for (const u of [
            mkUser('disc', 'WAITER', ['OP_APPLY_DISCOUNT']),
            mkUser('noperm', 'WAITER', []),
            mkUser('close', 'PICKUP_STAFF', ['OP_CLOSE_DAY']),
            mkUser('menu', 'PICKUP_STAFF', ['CFG_EDIT_MENU_PRICING']),
            mkUser('branch', 'PICKUP_STAFF', ['CFG_MANAGE_BRANCHES']),
            mkUser('stock', 'PICKUP_STAFF', ['OP_TRANSFER_STOCK']),
            mkUser('refund', 'CAPTAIN', ['OP_PROCESS_REFUND']),
            mkUser('union', 'WAITER', []),
            mkUser('merged', 'WAITER', ['OP_CLOSE_DAY']),
            mkUser('admin', 'SUPER_ADMIN', ['*']),
            mkUser('cashier2', 'CASHIER', []),
            mkUser('driver2', 'DRIVER', []),
            mkUser('allperms', 'PICKUP_STAFF', [
                'OP_MANAGE_SHIFTS', 'OP_MANAGE_DELIVERY', 'OP_MANAGE_MARKETING',
                'OP_MANAGE_WASTAGE', 'OP_MANAGE_PRODUCTION', 'OP_MANAGE_BUDGETS',
                'OP_MANAGE_CUSTOMERS', 'OP_MANAGE_FINANCE', 'OP_KDS_OPERATE',
                'CFG_MANAGE_SETTINGS', 'CFG_MANAGE_PRINTERS', 'CFG_MANAGE_PLATFORMS',
                'CFG_MANAGE_WAREHOUSES',
            ]),
        ]) {
            await db.insert(users).values({
                id: u.id, name: u.name, email: u.email,
                role: u.role as any, permissions: u.permissions as any,
                assignedBranchId: F.branchId, isActive: true, mfaEnabled: false,
            } as any).onConflictDoNothing();
        }
        // PIN-holding approvers: a BRANCH_MANAGER (classic) and a CAPTAIN that
        // only qualifies via OP_APPLY_DISCOUNT (proves the widening).
        await db.insert(users).values({
            id: `test-permgate-pinmgr-${suffix}`, name: 'Pin Manager', email: `permgate-pinmgr-${suffix}@restoflow.local`,
            role: 'BRANCH_MANAGER', permissions: [], managerPin: '9999',
            assignedBranchId: F.branchId, isActive: true, mfaEnabled: false,
        } as any).onConflictDoNothing();
        await db.insert(users).values({
            id: `test-permgate-pinholder-${suffix}`, name: 'Perm Holder', email: `permgate-pinholder-${suffix}@restoflow.local`,
            role: 'CAPTAIN', permissions: ['OP_APPLY_DISCOUNT'], managerPin: '4321',
            assignedBranchId: F.branchId, isActive: true, mfaEnabled: false,
        } as any).onConflictDoNothing();
    });

    it('grants coupon creation to a non-listed role holding OP_APPLY_DISCOUNT', async () => {
        const { token } = await loginAs(`permgate-disc-${suffix}@restoflow.local`);
        const res = await request(app)
            .post('/api/marketing/coupons')
            .set('Authorization', `Bearer ${token}`)
            .send({ code: `TST-${suffix}`, type: 'PERCENTAGE', value: 10 });
        expect(res.status).toBe(201);
    });

    it('still refuses coupon creation without the permission', async () => {
        const { token } = await loginAs(`permgate-noperm-${suffix}@restoflow.local`);
        const res = await request(app)
            .post('/api/marketing/coupons')
            .set('Authorization', `Bearer ${token}`)
            .send({ code: `TST2-${suffix}`, type: 'PERCENTAGE', value: 10 });
        expect(res.status).toBe(403);
    });

    it('grants day-close business-date to OP_CLOSE_DAY holders outside the role list', async () => {
        const { token } = await loginAs(`permgate-close-${suffix}@restoflow.local`);
        const res = await request(app)
            .put(`/api/day-close/${F.branchId}/business-date`)
            .set('Authorization', `Bearer ${token}`)
            .send({ branchId: F.branchId, businessDate: new Date().toISOString().slice(0, 10) });
        expect(res.status).not.toBe(403);
    });

    it('grants menu/printer-branch/stock/refund ops via screen permissions', async () => {
        const menu = await loginAs(`permgate-menu-${suffix}@restoflow.local`);
        const menuRes = await request(app).post('/api/menu/categories')
            .set('Authorization', `Bearer ${menu.token}`).send({ name: `Perm Cat ${suffix}` });
        expect(menuRes.status).not.toBe(403);

        const branch = await loginAs(`permgate-branch-${suffix}@restoflow.local`);
        const branchRes = await request(app).post('/api/branches')
            .set('Authorization', `Bearer ${branch.token}`).send({ name: `Perm Branch ${suffix}` });
        expect(branchRes.status).not.toBe(403);

        const stock = await loginAs(`permgate-stock-${suffix}@restoflow.local`);
        const stockRes = await request(app).post('/api/inventory/stock/transfer')
            .set('Authorization', `Bearer ${stock.token}`)
            .send({ branchId: F.branchId, item_id: 'x', from_warehouse_id: 'a', to_warehouse_id: 'b', quantity: 1 });
        expect(stockRes.status).not.toBe(403);

        const refund = await loginAs(`permgate-refund-${suffix}@restoflow.local`);
        const refundRes = await request(app).put('/api/refunds/NOPE/reject')
            .set('Authorization', `Bearer ${refund.token}`)
            .send({ branchId: F.branchId, reason: 'test' });
        expect(refundRes.status).not.toBe(403);
    });

    it('token carries role defaults even with an empty stored snapshot', async () => {
        const { token } = await loginAs(`permgate-union-${suffix}@restoflow.local`);
        const payload = decodeToken(token);
        expect(Array.isArray(payload.permissions)).toBe(true);
        // WAITER code defaults include OP_PLACE_ORDER — union, not snapshot-only.
        expect(payload.permissions).toContain('OP_PLACE_ORDER');
    });

    it('token merges stored grants with role defaults', async () => {
        const { token } = await loginAs(`permgate-merged-${suffix}@restoflow.local`);
        const payload = decodeToken(token);
        expect(payload.permissions).toContain('OP_CLOSE_DAY');
        expect(payload.permissions).toContain('OP_PLACE_ORDER');
    });

    it('refresh returns permissions as an array (no raw nvarchar leak)', async () => {
        const { refreshToken } = await loginAs(`permgate-merged-${suffix}@restoflow.local`);
        const res = await request(app).post('/api/auth/refresh').send({ refreshToken });
        expect(res.status).toBe(200);
        const payload = decodeToken(res.body.token);
        expect(Array.isArray(payload.permissions)).toBe(true);
        expect(payload.permissions).toContain('OP_CLOSE_DAY');
    });

    it('granting a permission kills old sessions; the grant works after re-login', async () => {
        const email = `permgate-noperm-${suffix}@restoflow.local`;
        const before = await loginAs(email);
        // Sanity: old token is alive (identify endpoint is auth-only).
        const alive = await request(app).get('/api/auth/me')
            .set('Authorization', `Bearer ${before.token}`);
        expect(alive.status).toBe(200);

        // SUPER_ADMIN grants OP_CLOSE_DAY to that user via the screen's endpoint.
        const admin = await loginAs(`permgate-admin-${suffix}@restoflow.local`);
        const [target] = await db.select().from(users).where(eq(users.email, email));
        const grant = await request(app).put(`/api/users/${target.id}/permissions`)
            .set('Authorization', `Bearer ${admin.token}`)
            .send({ permissions: ['OP_CLOSE_DAY'] });
        expect(grant.status).toBe(200);

        // Old session is revoked immediately.
        const dead = await request(app).get('/api/auth/me')
            .set('Authorization', `Bearer ${before.token}`);
        expect(dead.status).toBe(401);

        // After re-login the grant is live: day-close business-date passes the guard.
        const after = await loginAs(email);
        const payload = decodeToken(after.token);
        expect(payload.permissions).toContain('OP_CLOSE_DAY');
        const close = await request(app)
            .put(`/api/day-close/${F.branchId}/business-date`)
            .set('Authorization', `Bearer ${after.token}`)
            .send({ branchId: F.branchId, businessDate: new Date().toISOString().slice(0, 10) });
        expect(close.status).not.toBe(403);
    });

    it('shared discount code approves APPLY_DISCOUNT without any manager PIN', async () => {
        const { token } = await loginAs(`permgate-noperm-${suffix}@restoflow.local`);
        const res = await request(app).post('/api/approvals/verify-pin')
            .set('Authorization', `Bearer ${token}`)
            .send({ branchId: F.branchId, pin: '10009999', action: 'APPLY_DISCOUNT' });
        expect(res.body.approved).toBe(true);
        expect(res.body.approval?.reason).toBe('Discount Code Verified');
    });

    it('shared discount code never approves non-discount actions', async () => {
        const { token } = await loginAs(`permgate-noperm-${suffix}@restoflow.local`);
        const res = await request(app).post('/api/approvals/verify-pin')
            .set('Authorization', `Bearer ${token}`)
            .send({ branchId: F.branchId, pin: '10009999', action: 'VOID_ORDER' });
        expect(res.body.approved).not.toBe(true);
    });

    it('permission-holder approves discounts with their own PIN (no manager role)', async () => {
        const { token } = await loginAs(`permgate-pinholder-${suffix}@restoflow.local`);
        const res = await request(app).post('/api/approvals/verify-pin')
            .set('Authorization', `Bearer ${token}`)
            .send({ branchId: F.branchId, pin: '4321', action: 'APPLY_DISCOUNT' });
        expect(res.body.approved).toBe(true);
    });

    it('classic manager PIN approval still works', async () => {
        const { token } = await loginAs(`permgate-pinmgr-${suffix}@restoflow.local`);
        const res = await request(app).post('/api/approvals/verify-pin')
            .set('Authorization', `Bearer ${token}`)
            .send({ branchId: F.branchId, pin: '9999', action: 'APPLY_DISCOUNT' });
        expect(res.body.approved).toBe(true);
    });

    it('new operation permissions open their routes (and stay closed without them)', async () => {
        const { token } = await loginAs(`permgate-allperms-${suffix}@restoflow.local`);
        const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
        const not403 = async (method: 'post' | 'put', url: string, body: any) => {
            const res = await (request(app)[method](url) as any)
                .set(auth(token)).send({ branchId: F.branchId, ...body });
            expect(`${method} ${url} -> ${res.status}`).not.toContain('403');
            return res;
        };
        await not403('post', '/api/shifts/open', { openingBalance: 0 });
        await not403('post', '/api/printers', { name: `Perm Printer ${suffix}` });
        await not403('put', '/api/settings/perm_gate_test', { value: 'x' });
        await not403('post', '/api/kds/NOPE/bump', {});
        await not403('post', '/api/delivery/zones', { name: `Perm Zone ${suffix}` });
        await not403('post', '/api/wastage', { itemId: 'x', quantity: 1, reason: 'test' });
        await not403('post', '/api/production/orders', { items: [] });
        await not403('post', '/api/budgets', { name: `Perm Budget ${suffix}` });
        await not403('post', '/api/customers', { name: 'Perm Customer', phone: '01000000000' });

        const { token: driverToken } = await loginAs(`permgate-driver2-${suffix}@restoflow.local`);
        const denied = await request(app).post('/api/shifts/open')
            .set(auth(driverToken)).send({ branchId: F.branchId, openingBalance: 0 });
        expect(denied.status).toBe(403);
    });

    it('cashiers still dispatch kitchen orders (dispatch follows order placement)', async () => {
        const { token } = await loginAs(`permgate-cashier2-${suffix}@restoflow.local`);
        const res = await request(app).post('/api/kds/dispatch')
            .set('Authorization', `Bearer ${token}`)
            .send({ orderId: 'NOPE', branchId: F.branchId });
        expect(res.status).not.toBe(403);
    });
});
