import { Request, Response } from 'express';
import { db, pool } from '../db';
import { branches, floorZones, printers, roles, settings, tables, users } from '../../src/db/schema';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const tableExists = async (tableName: string) => {
    const result = await pool.query<{ exists: boolean }>(
        `select exists(
            select 1
            from information_schema.tables
            where table_schema = 'public'
              and table_name = $1
        )`,
        [tableName.toLowerCase()],
    );
    return Boolean(result.rows[0]?.exists);
};

const columnExists = async (tableName: string, columnName: string) => {
    const result = await pool.query<{ exists: boolean }>(
        `select exists(
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = $1
              and column_name = $2
        )`,
        [tableName.toLowerCase(), columnName.toLowerCase()],
    );
    return Boolean(result.rows[0]?.exists);
};

const hasAnyUsers = async () => {
    const usersTableExists = await tableExists('users');
    if (!usersTableExists) return false;
    const existing = await db.select({ id: users.id }).from(users).limit(1);
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
        const admin = body.admin || {};
        const branch = body.branch || {};
        const appSettings = body.settings || {};
        const setupPrinters = Array.isArray(body.printers) ? body.printers : [];
        const setupRoles = Array.isArray(body.roles) ? body.roles : [];
        const setupTables = Array.isArray(body.tables) ? body.tables : [];

        if (!admin.name || !admin.email || !admin.password) {
            return res.status(400).json({ error: 'ADMIN_FIELDS_REQUIRED' });
        }
        if (String(admin.password).length < 6) {
            return res.status(400).json({ error: 'PASSWORD_TOO_SHORT' });
        }
        if (!branch.name) {
            return res.status(400).json({ error: 'BRANCH_NAME_REQUIRED' });
        }

        const branchId = branch.id || `branch-${crypto.randomUUID()}`;
        const userId = admin.id || `user-${crypto.randomUUID()}`;
        const passwordHash = await bcrypt.hash(String(admin.password), 10);
        const defaultZoneId = `zone-${branchId}-main`;

        await db.transaction(async (tx) => {
            await tx.insert(branches).values({
                id: branchId,
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
            });

            await tx.insert(users).values({
                id: userId,
                name: admin.name,
                email: admin.email,
                passwordHash,
                role: 'SUPER_ADMIN',
                permissions: [],
                assignedBranchId: branchId,
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

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
                await tx.insert(settings)
                    .values({
                        key: entry.key,
                        value: entry.value,
                        category: 'setup',
                        updatedAt: new Date(),
                    })
                    .onConflictDoUpdate({
                        target: settings.key,
                        set: { value: entry.value, updatedAt: new Date() }
                    });
            }

            if (setupPrinters.length > 0) {
                for (const rawPrinter of setupPrinters) {
                    const name = String(rawPrinter?.name || '').trim();
                    if (!name) continue;
                    const type = String(rawPrinter?.type || 'RECEIPT').trim().toUpperCase();
                    const printerId = rawPrinter?.id || `PRN-${crypto.randomUUID()}`;

                    await tx.insert(printers)
                        .values({
                            id: printerId,
                            name,
                            type,
                            address: rawPrinter?.address || '',
                            location: rawPrinter?.location || '',
                            branchId,
                            isActive: rawPrinter?.isActive !== false,
                            paperWidth: Number(rawPrinter?.paperWidth || 80),
                            createdAt: new Date(),
                        })
                        .onConflictDoNothing({ target: printers.id });
                }
            }

            if (setupRoles.length > 0) {
                for (const rawRole of setupRoles) {
                    const roleName = String(rawRole?.name || '').trim();
                    if (!roleName) continue;
                    const roleId = rawRole?.id || `role-${crypto.randomUUID()}`;
                    const rolePermissions = Array.isArray(rawRole?.permissions) ? rawRole.permissions : [];

                    await tx.insert(roles)
                        .values({
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
                        })
                        .onConflictDoNothing({ target: roles.name });
                }
            }

            if (setupTables.length > 0) {
                await tx.insert(floorZones)
                    .values({
                        id: defaultZoneId,
                        name: branch.zoneName || 'Main Hall',
                        branchId,
                        width: 1600,
                        height: 1200,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    })
                    .onConflictDoUpdate({
                        target: floorZones.id,
                        set: {
                            name: branch.zoneName || 'Main Hall',
                            branchId,
                            updatedAt: new Date(),
                        },
                    });

                for (const rawTable of setupTables) {
                    const tableName = String(rawTable?.name || '').trim();
                    if (!tableName) continue;
                    const tableId = rawTable?.id || `TBL-${crypto.randomUUID()}`;
                    const seats = Math.max(1, Number(rawTable?.capacity || rawTable?.seats || 4));

                    await tx.insert(tables)
                        .values({
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
                        })
                        .onConflictDoNothing({ target: tables.id });
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

        res.status(201).json({ ok: true });
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

        let truncated = 0;
        const skipped: string[] = [];
        for (const table of tablesToTruncate) {
            if (await tableExists(table)) {
                await pool.query(`TRUNCATE TABLE public."${table}" RESTART IDENTITY CASCADE`);
                truncated++;
            } else {
                skipped.push(table);
            }
        }

        let stockReset = false;
        if (await tableExists('inventory_stock')) {
            if (await columnExists('inventory_stock', 'last_updated')) {
                await pool.query(`UPDATE public.inventory_stock SET quantity = 0, last_updated = now()`);
            } else {
                await pool.query(`UPDATE public.inventory_stock SET quantity = 0`);
            }
            stockReset = true;
        }

        let tableOccupancyReset = false;
        if (await tableExists('tables')) {
            const assignments = [`status = 'AVAILABLE'`];
            if (await columnExists('tables', 'current_order_id')) assignments.push('current_order_id = NULL');
            if (await columnExists('tables', 'locked_by_user_id')) assignments.push('locked_by_user_id = NULL');
            if (await columnExists('tables', 'updated_at')) assignments.push('updated_at = now()');
            await pool.query(`UPDATE public.tables SET ${assignments.join(', ')}`);
            tableOccupancyReset = true;
        }

        let businessDayReset = false;
        if (await tableExists('branches') && await columnExists('branches', 'is_day_open')) {
            await pool.query(`UPDATE public.branches SET is_day_open = false`);
            businessDayReset = true;
        }

        if (await tableExists('settings')) {
            await pool.query(`
                DELETE FROM public.settings
                WHERE key IN (
                    'driverTelemetry',
                    'deliverySlaEscalations',
                    'whatsapp_inbox_v1',
                    'whatsapp_escalations_v1',
                    'whatsapp_last_webhook_event'
                )
            `);
        }

        res.json({
            ok: true,
            mode: 'OPERATIONAL_HANDOVER_RESET',
            truncated,
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
