import { Request, Response } from 'express';
import { db, pool } from '../db';
import { branches, floorZones, printers, roles, settings, tables, users } from '../../src/db/schema';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { eq, notInArray, sql } from 'drizzle-orm';
import { toSettingValue } from '../utils/settingsStore.js';
import { validatePassword } from '../services/passwordPolicyService';
import { AppPermission, UserRole, INITIAL_ROLE_PERMISSIONS } from '../../types';

// Coduis Master gate: the setup wizard is a dealer-only tool. The key can be
// rotated via env without a code change; the fallback is the master password.
const CODUIS_MASTER_KEY = process.env.CODUIS_MASTER_KEY || process.env.DEALER_SETUP_KEY || 'Chaos@$321';

const readMasterKey = (body: any): string =>
    String(body?.masterKey ?? body?.dealerKey ?? '').trim();

export const verifyMasterKey = (req: Request, res: Response) => {
    if (readMasterKey(req.body) && readMasterKey(req.body) === CODUIS_MASTER_KEY) {
        return res.json({ ok: true });
    }
    return res.status(403).json({ error: 'INVALID_MASTER_KEY' });
};

// Dealer setup: only these roles may be assigned to the bootstrapped admin.
// Anything else falls back to SUPER_ADMIN (historic behavior).
const SETUP_ADMIN_ROLES = [
    UserRole.SUPER_ADMIN,
    UserRole.OWNER,
    UserRole.BRANCH_MANAGER,
    UserRole.CAFE_ADMIN,
] as string[];

const resolveSetupAdminIdentity = (admin: any): { role: string; permissions: string[] } => {
    const rawRole = String(admin?.role || UserRole.SUPER_ADMIN).toUpperCase().trim();
    const role = SETUP_ADMIN_ROLES.includes(rawRole) ? rawRole : UserRole.SUPER_ADMIN;
    const validPerms = new Set(Object.values(AppPermission) as string[]);
    const provided = Array.isArray(admin?.permissions)
        ? (admin.permissions as unknown[]).map((p) => String(p)).filter((p) => validPerms.has(p))
        : [];
    // SUPER_ADMIN bypasses all checks server-side, so it needs no stored permissions.
    if (role === UserRole.SUPER_ADMIN) return { role, permissions: [] };
    if (provided.length > 0) return { role, permissions: Array.from(new Set(provided)) };
    return { role, permissions: [...(INITIAL_ROLE_PERMISSIONS[role as UserRole] || [])] };
};

const isEmailLike = (value: unknown) =>
    typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

interface SetupStaffInput {
    name: string;
    email: string;
    password?: string;
    pin?: string;
    role: string;
    permissions: string[];
    defaultPage?: string;
}

// Staff accounts the dealer creates on-site (cashier, kitchen, pickup...).
// Throws with a *_REQUIRED / *_INVALID code message on bad input.
const resolveSetupStaff = async (rawStaff: unknown): Promise<SetupStaffInput[]> => {
    if (rawStaff == null) return [];
    if (!Array.isArray(rawStaff)) throw new Error('STAFF_MUST_BE_ARRAY');
    const validPerms = new Set(Object.values(AppPermission) as string[]);
    const validRoles = new Set(Object.values(UserRole) as string[]);
    const out: SetupStaffInput[] = [];
    const seenEmails = new Set<string>();
    const seenPins = new Set<string>();
    for (let i = 0; i < rawStaff.length; i++) {
        const s: any = rawStaff[i] || {};
        const name = String(s.name || '').trim();
        if (!name) throw new Error(`STAFF_${i}_NAME_REQUIRED`);
        const role = String(s.role || UserRole.CASHIER).toUpperCase().trim();
        if (!validRoles.has(role) || role === UserRole.SUPER_ADMIN || role === UserRole.CUSTOM) {
            throw new Error(`STAFF_${i}_ROLE_INVALID`);
        }
        let email = String(s.email || '').trim().toLowerCase();
        if (!email) email = `${role.toLowerCase().replace(/[^a-z0-9]+/g, '')}${i}-${Date.now().toString(36)}@pos.local`;
        if (!isEmailLike(email)) throw new Error(`STAFF_${i}_EMAIL_INVALID`);
        if (seenEmails.has(email)) throw new Error(`STAFF_${i}_EMAIL_DUPLICATE`);
        seenEmails.add(email);
        const password = String(s.password || '');
        const pin = String(s.pin || '').trim();
        if (!password && !pin) throw new Error(`STAFF_${i}_AUTH_REQUIRED`);
        if (password) {
            const pwCheck = validatePassword(password);
            if (!pwCheck.valid) throw new Error(`STAFF_${i}_PASSWORD_POLICY_FAILED: ${pwCheck.errors.join('; ')}`);
        }
        if (pin) {
            if (!/^\d{6}$/.test(pin)) throw new Error(`STAFF_${i}_PIN_MUST_BE_6_DIGITS`);
            if (seenPins.has(pin)) throw new Error(`STAFF_${i}_PIN_DUPLICATE`);
            seenPins.add(pin);
        }
        const permissions = Array.isArray(s.permissions)
            ? Array.from(new Set((s.permissions as unknown[]).map((p) => String(p)).filter((p) => validPerms.has(p))))
            : [...(INITIAL_ROLE_PERMISSIONS[role as UserRole] || [])];
        const defaultPage = typeof s.defaultPage === 'string' ? s.defaultPage : undefined;
        out.push({ name, email, password: password || undefined, pin: pin || undefined, role, permissions, defaultPage });
    }
    return out;
};

const tableExists = async (tableName: string) => {
    const result = await pool.query(
        `select 1
         from information_schema.tables
         where table_schema = SCHEMA_NAME()
           and table_name = $1`,
        [tableName.toLowerCase()],
    );
    return result.rows.length > 0;
};

const columnExists = async (tableName: string, columnName: string) => {
    const result = await pool.query(
        `select 1
         from information_schema.columns
         where table_schema = SCHEMA_NAME()
           and table_name = $1
           and column_name = $2`,
        [tableName.toLowerCase(), columnName.toLowerCase()],
    );
    return result.rows.length > 0;
};

export const RECOVERY_ACCOUNT_EMAILS = [
    'recovery.admin@restoflow.local',
    'recovery.cashier@restoflow.local',
] as const;

const hasAnyUsers = async () => {
    const usersTableExists = await tableExists('users');
    if (!usersTableExists) return false;
    // Installer recovery accounts keep a clean PC accessible, but must not
    // consume the one-time owner bootstrap for the real restaurant account.
    const existing = await db.select({ id: users.id })
        .top(1)
        .from(users)
        .where(notInArray(users.email, [...RECOVERY_ACCOUNT_EMAILS]));
    return existing.length > 0;
};

export const getSetupStatus = async (_req: Request, res: Response) => {
    try {
        const needsSetup = !(await hasAnyUsers());
        res.json({ needsSetup });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const bootstrapSetup = async (req: Request, res: Response) => {
    try {
        if (await hasAnyUsers()) {
            return res.status(409).json({ error: 'ALREADY_INITIALIZED' });
        }

        const body = req.body || {};

        // Coduis-Master-only gate: the wizard must send the master key.
        if (readMasterKey(body) !== CODUIS_MASTER_KEY) {
            return res.status(403).json({ error: 'INVALID_MASTER_KEY' });
        }

        const admin = body.admin || {};
        const branch = body.branch || {};
        const appSettings = body.settings || {};
        const setupPrinters = Array.isArray(body.printers) ? body.printers : [];
        const setupRoles = Array.isArray(body.roles) ? body.roles : [];
        const setupTables = Array.isArray(body.tables) ? body.tables : [];
        let setupStaff: SetupStaffInput[] = [];
        try {
            setupStaff = await resolveSetupStaff(body.staff);
        } catch (e: any) {
            return res.status(400).json({ error: e?.message || 'STAFF_INVALID' });
        }
        // Staff e-mails must not collide with existing accounts.
        if (setupStaff.length > 0) {
            const adminEmail = String(admin.email || '').trim().toLowerCase();
            const staffEmails = new Set([adminEmail, ...setupStaff.map((s) => s.email)]);
            const existing = await db.select({ email: users.email }).from(users);
            for (const row of existing) {
                if (staffEmails.has(String(row.email || '').trim().toLowerCase())) {
                    return res.status(409).json({ error: 'STAFF_EMAIL_ALREADY_EXISTS' });
                }
            }
        }

        if (!admin.name || !admin.email || !admin.password) {
            return res.status(400).json({ error: 'ADMIN_FIELDS_REQUIRED' });
        }
        const passwordValidation = validatePassword(String(admin.password || ''));
        if (!passwordValidation.valid) {
            return res.status(400).json({ error: 'PASSWORD_POLICY_FAILED', details: passwordValidation.errors });
        }
        if (!branch.name) {
            return res.status(400).json({ error: 'BRANCH_NAME_REQUIRED' });
        }

        const [existingBranch] = branch.id
            ? await db.select().top(1).from(branches).where(eq(branches.id, branch.id))
            : await db.select().top(1).from(branches);
        const branchId = branch.id || existingBranch?.id || `branch-${crypto.randomUUID()}`;
        const userId = admin.id || `user-${crypto.randomUUID()}`;
        const passwordHash = await bcrypt.hash(String(admin.password), 10);
        const defaultZoneId = `zone-${branchId}-main`;
        const adminIdentity = resolveSetupAdminIdentity(admin);

        await db.transaction(async (tx) => {
            const branchValues = {
                name: branch.name,
                nameAr: branch.nameAr,
                location: branch.location || branch.address,
                address: branch.address,
                phone: branch.phone,
                email: branch.email,
                isActive: true,
                timezone: branch.timezone || 'Africa/Cairo',
                currency: branch.currency || appSettings.currency || 'EGP',
                taxRate: branch.taxRate ?? appSettings.taxRate ?? 14,
                serviceCharge: branch.serviceCharge ?? appSettings.serviceCharge ?? 0,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            if (existingBranch) {
                await tx.update(branches).set(branchValues).where(eq(branches.id, branchId));
            } else {
                await tx.insert(branches).values({ id: branchId, ...branchValues });
            }

            await tx.insert(users).values({
                id: userId,
                name: admin.name,
                email: admin.email,
                passwordHash,
                role: adminIdentity.role,
                permissions: adminIdentity.permissions,
                assignedBranchId: branchId,
                allowedBranches: [branchId],
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            for (const member of setupStaff) {
                const staffPasswordHash = member.password ? await bcrypt.hash(member.password, 10) : null;
                const staffPinHash = member.pin ? await bcrypt.hash(member.pin, 10) : null;
                await tx.insert(users).values({
                    id: `user-${crypto.randomUUID()}`,
                    name: member.name,
                    email: member.email,
                    passwordHash: staffPasswordHash,
                    pinCode: member.pin || null,
                    pinCodeHash: staffPinHash,
                    pinLoginEnabled: Boolean(member.pin),
                    role: member.role,
                    permissions: member.permissions,
                    customPermissions: (member.defaultPage ? { defaultPage: member.defaultPage } : {}) as unknown as Record<string, boolean>,
                    assignedBranchId: branchId,
                    allowedBranches: [branchId],
                    isActive: true,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
            }

            const settingsEntries = [
                { key: 'restaurantName', value: appSettings.restaurantName || branch.name },
                { key: 'phone', value: appSettings.phone || branch.phone || '' },
                { key: 'branchAddress', value: appSettings.branchAddress || branch.address || '' },
                { key: 'currency', value: appSettings.currency || 'EGP' },
                { key: 'currencySymbol', value: appSettings.currencySymbol || '\u062c.\u0645' },
                { key: 'taxRate', value: appSettings.taxRate ?? 14 },
                { key: 'serviceCharge', value: appSettings.serviceCharge ?? 0 },
                { key: 'language', value: appSettings.language || 'ar' },
                { key: 'theme', value: appSettings.theme || 'modern' },
                { key: 'isDarkMode', value: appSettings.isDarkMode ?? true },
                { key: 'isTouchMode', value: appSettings.isTouchMode ?? false },
            ];

            for (const entry of settingsEntries) {
                const [existingSetting] = await tx.select().top(1).from(settings).where(eq(settings.key, entry.key));
                if (existingSetting) {
                    await tx.update(settings)
                        .set({ value: toSettingValue(entry.value), updatedAt: new Date() })
                        .where(eq(settings.key, entry.key));
                } else {
                    await tx.insert(settings).values({
                        key: entry.key,
                        value: toSettingValue(entry.value),
                        category: 'setup',
                        updatedAt: new Date(),
                    });
                }
            }

            if (setupPrinters.length > 0) {
                for (const rawPrinter of setupPrinters) {
                    const name = String(rawPrinter?.name || '').trim();
                    if (!name) continue;
                    const type = String(rawPrinter?.type || 'RECEIPT').trim().toUpperCase();
                    const printerId = rawPrinter?.id || `PRN-${crypto.randomUUID()}`;

                    const [existingPrinter] = await tx.select().top(1).from(printers).where(eq(printers.id, printerId));
                    if (!existingPrinter) {
                        await tx.insert(printers).values({
                            id: printerId,
                            name,
                            type,
                            address: rawPrinter?.address || '',
                            location: rawPrinter?.location || '',
                            branchId,
                            isActive: rawPrinter?.isActive !== false,
                            paperWidth: Number(rawPrinter?.paperWidth || 80),
                            createdAt: new Date(),
                        });
                    }
                }
            }

            if (setupRoles.length > 0) {
                for (const rawRole of setupRoles) {
                    const roleName = String(rawRole?.name || '').trim();
                    if (!roleName) continue;
                    const roleId = rawRole?.id || `role-${crypto.randomUUID()}`;
                    const rolePermissions = Array.isArray(rawRole?.permissions) ? rawRole.permissions : [];

                    const [existingRole] = await tx.select().top(1).from(roles).where(eq(roles.name, roleName));
                    if (!existingRole) {
                        await tx.insert(roles).values({
                            id: roleId,
                            name: roleName,
                            nameAr: rawRole?.nameAr || null,
                            description: rawRole?.description || 'Custom role from setup wizard',
                            descriptionAr: rawRole?.descriptionAr || null,
                            permissions: rolePermissions,
                            isSystem: false,
                            isActive: true,
                            priority: Number(rawRole?.priority || 0),
                            color: rawRole?.color || '#6366f1',
                            icon: rawRole?.icon || 'user',
                            createdAt: new Date(),
                            updatedAt: new Date(),
                        });
                    }
                }
            }

            if (setupTables.length > 0) {
                const [existingDefaultZone] = await tx.select().top(1).from(floorZones).where(eq(floorZones.id, defaultZoneId));
                if (existingDefaultZone) {
                    await tx.update(floorZones)
                        .set({
                            name: branch.zoneName || 'Main Hall',
                            branchId,
                            updatedAt: new Date(),
                        })
                        .where(eq(floorZones.id, defaultZoneId));
                } else {
                    await tx.insert(floorZones).values({
                        id: defaultZoneId,
                        name: branch.zoneName || 'Main Hall',
                        branchId,
                        width: 1600,
                        height: 1200,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    });
                }

                for (const rawTable of setupTables) {
                    const tableName = String(rawTable?.name || '').trim();
                    if (!tableName) continue;
                    const tableId = rawTable?.id || `TBL-${crypto.randomUUID()}`;
                    const seats = Math.max(1, Number(rawTable?.capacity || rawTable?.seats || 4));

                    const [existingTable] = await tx.select().top(1).from(tables).where(eq(tables.id, tableId));
                    if (!existingTable) {
                        await tx.insert(tables).values({
                            id: tableId,
                            name: tableName,
                            branchId,
                            zoneId: rawTable?.zoneId || defaultZoneId,
                            x: Number(rawTable?.x || 0),
                            y: Number(rawTable?.y || 0),
                            width: Number(rawTable?.width || 100),
                            height: Number(rawTable?.height || 100),
                            shape: rawTable?.shape || 'rectangle',
                            seats,
                            status: 'AVAILABLE',
                            createdAt: new Date(),
                            updatedAt: new Date(),
                        });
                    }
                }
            }
        });

        // Seed Chart of Accounts and default posting rules
        try {
            const { COASeedService } = await import('../services/coaSeedService');
            await COASeedService.seed();
        } catch (seedError) {
            console.error('[SETUP] Failed to seed COA:', seedError);
        }

        res.status(201).json({ ok: true, staffCreated: setupStaff.length });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const seedCOA = async (req: Request, res: Response) => {
    try {
        const { COASeedService } = await import('../services/coaSeedService');
        await COASeedService.seed();
        res.json({ ok: true, message: 'Chart of Accounts structured and seeded successfully.' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Client handover reset: wipes operational/runtime data while preserving setup/master data.
 * Preserves: users, roles, branches, tables/floor zones, menus, menu items, recipes,
 * inventory item definitions, warehouses, suppliers, drivers, employees, printers, settings.
 * Clears: orders, payments, shifts, operational inventory movements, customers, sessions, and runtime logs.
 */
export const resetTestData = async (req: Request, res: Response) => {
    try {
        // Table names are intentionally static; missing tables are reported in the response.
        const tablesToTruncate = [
            'order_payments',
            'payment_sessions',
            // Order-related (most dependent)
            'order_status_history',
            'order_items',
            'payments',
            'delivery_assignments',
            'driver_telemetry',
            'driver_telemetry_latest',
            'refund_records',
            'idempotency_keys',
            // Orders themselves
            'orders',
            'kds_ticket_items',
            'kds_tickets',
            // Shifts
            'shifts',
            'day_close_reports',
            'daily_branch_summaries',
            'item_daily_snapshots',
            // Inventory
            'stock_count_lines',
            'stock_counts',
            'batch_transactions',
            'inventory_batches',
            'stock_movements',
            'inventory_ledger',
            'supplier_payments',
            'supplier_invoice_items',
            'supplier_invoices',
            'grn_items',
            'goods_receipt_notes',
            'purchase_request_items',
            'purchase_requests',
            'purchase_order_items',
            'purchase_orders',
            // CRM
            'customer_addresses',
            'customer_complaints',
            'customer_rfm_metrics',
            'customer_wallets',
            'wallet_transactions',
            'loyalty_ledger',
            'waitlists',
            'customers',
            // Finance (journals, but keep chart_of_accounts)
            'journal_lines',
            'journal_entries',
            'ledger_entries',
            'finance_exceptions',
            // Logs
            'audit_logs',
            'domain_events',
            'notifications',
            'internal_messages',
            'webhook_deliveries',
            'fiscal_logs',
            'eta_dead_letters',
            'campaign_logs',
            'campaigns',
            'whatsapp_messages',
            // Production
            'production_order_items',
            'production_orders',
            // HR
            'payroll_payouts',
            'payroll_cycles',
            'payroll',
            'leave_requests',
            'overtime_entries',
            'attendance',
            'user_daily_performance',
            // Misc
            'manager_approvals',
            'reservations',
            'user_sessions',
        ];

        const skipped: string[] = [];
        const existingTables: string[] = [];
        for (const table of tablesToTruncate) {
            if (await tableExists(table)) existingTables.push(table);
            else skipped.push(table);
        }

        const tableSet = new Set(existingTables);
        const foreignKeys = await pool.query(`
            SELECT OBJECT_NAME(parent_object_id) AS child_table,
                   OBJECT_NAME(referenced_object_id) AS parent_table
            FROM sys.foreign_keys
        `);
        const edges = new Map(existingTables.map(table => [table, new Set<string>()]));
        const incoming = new Map(existingTables.map(table => [table, 0]));
        for (const row of foreignKeys.rows) {
            const child = String(row.child_table || '').toLowerCase();
            const parent = String(row.parent_table || '').toLowerCase();
            if (!tableSet.has(child) || !tableSet.has(parent) || child === parent || edges.get(child)?.has(parent)) continue;
            edges.get(child)?.add(parent);
            incoming.set(parent, Number(incoming.get(parent) || 0) + 1);
        }
        const queue = existingTables.filter(table => incoming.get(table) === 0);
        const deleteOrder: string[] = [];
        while (queue.length > 0) {
            const table = queue.shift()!;
            deleteOrder.push(table);
            for (const parent of edges.get(table) || []) {
                const next = Number(incoming.get(parent) || 0) - 1;
                incoming.set(parent, next);
                if (next === 0) queue.push(parent);
            }
        }
        if (deleteOrder.length !== existingTables.length) {
            const cycle = existingTables.filter(table => !deleteOrder.includes(table));
            throw new Error(`RESET_FOREIGN_KEY_CYCLE: ${cycle.join(', ')}`);
        }

        const stockReset = await tableExists('inventory_stock');
        const stockHasLastUpdated = stockReset && await columnExists('inventory_stock', 'last_updated');
        const tableOccupancyReset = await tableExists('tables');
        const tableAssignments = [`status = 'AVAILABLE'`];
        if (tableOccupancyReset && await columnExists('tables', 'current_order_id')) tableAssignments.push('current_order_id = NULL');
        if (tableOccupancyReset && await columnExists('tables', 'locked_by_user_id')) tableAssignments.push('locked_by_user_id = NULL');
        if (tableOccupancyReset && await columnExists('tables', 'updated_at')) tableAssignments.push('updated_at = GETDATE()');
        const businessDayReset = await tableExists('branches') && await columnExists('branches', 'is_day_open');
        const settingsReset = await tableExists('settings');

        await db.transaction(async tx => {
            for (const table of deleteOrder) {
                await tx.execute(sql.raw(`DELETE FROM [${table}]`));
            }
            if (stockReset) {
                await tx.execute(sql.raw(`UPDATE inventory_stock SET quantity = 0${stockHasLastUpdated ? ', last_updated = GETDATE()' : ''}`));
            }
            if (tableOccupancyReset) await tx.execute(sql.raw(`UPDATE tables SET ${tableAssignments.join(', ')}`));
            if (businessDayReset) await tx.execute(sql.raw(`UPDATE branches SET is_day_open = 0`));
            if (settingsReset) {
                await tx.execute(sql`
                    DELETE FROM settings
                    WHERE [key] IN (
                        'driverTelemetry',
                        'deliverySlaEscalations',
                        'whatsapp_inbox_v1',
                        'whatsapp_escalations_v1',
                        'whatsapp_last_webhook_event'
                    )
                `);
            }
        });

        res.json({
            ok: true,
            mode: 'OPERATIONAL_HANDOVER_RESET',
            truncated: deleteOrder.length,
            skipped,
            tables: tablesToTruncate.length,
            stockReset,
            tableOccupancyReset,
            businessDayReset,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
