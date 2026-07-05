import { Request, Response } from 'express';
import { aiService } from '../services/aiService';
import { db } from '../db';
import { orders, inventoryItems, menuCategories, menuItems, customers, users, employees } from '../../src/db/schema';
import { eq, gte } from 'drizzle-orm';
import { guardAction, type AIAction } from '../../src/services/aiActionGuard';
import crypto from 'crypto';
import { AI_ACTION_SPECS, evaluateActionAuthorization, hasPermission } from '../services/aiPolicy';
import { AuthUser } from '../middleware/auth';
import { aiKeyVaultService } from '../services/aiKeyVaultService';
import { revenueForecastService } from '../services/revenueForecastService';
import { hrExtendedService } from '../services/hrExtendedService';
import payrollCalculationService from '../services/payrollCalculationService';

const normalizeActionType = (rawType: string) => {
    const normalized = String(rawType || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
    const aliasMap: Record<string, string> = {
        UPDATE_THRESHOLD: 'UPDATE_INVENTORY',
        UPDATE_STOCK: 'UPDATE_INVENTORY',
        EDIT_INVENTORY: 'UPDATE_INVENTORY',
        ADD_MENU_ITEM: 'CREATE_MENU_ITEM',
        CREATE_ITEM: 'CREATE_MENU_ITEM',
        ADD_ITEM: 'CREATE_MENU_ITEM',
        EDIT_MENU_ITEM: 'UPDATE_MENU_ITEM',
        MODIFY_MENU_ITEM: 'UPDATE_MENU_ITEM',
        UPDATE_ITEM: 'UPDATE_MENU_ITEM',
        ADD_CATEGORY: 'CREATE_MENU_CATEGORY',
        CREATE_CATEGORY: 'CREATE_MENU_CATEGORY',
        ADD_SECTION: 'CREATE_MENU_CATEGORY',
        CREATE_SECTION: 'CREATE_MENU_CATEGORY',
        EDIT_CATEGORY: 'UPDATE_MENU_CATEGORY',
        MODIFY_CATEGORY: 'UPDATE_MENU_CATEGORY',
        UPDATE_CATEGORY: 'UPDATE_MENU_CATEGORY',
        ADD_CUSTOMER: 'CREATE_CUSTOMER',
        CREATE_CLIENT: 'CREATE_CUSTOMER',
        ADD_USER: 'CREATE_USER',
        CREATE_STAFF: 'CREATE_EMPLOYEE',
        ADD_EMPLOYEE: 'CREATE_EMPLOYEE',
        CREATE_EMPLOYEE: 'CREATE_EMPLOYEE',
        REQUEST_LEAVE: 'CREATE_LEAVE_REQUEST',
        ADD_LEAVE: 'CREATE_LEAVE_REQUEST',
        ADD_BONUS: 'CREATE_BONUS_PENALTY',
        ADD_PENALTY: 'CREATE_BONUS_PENALTY',
        ADD_ADVANCE: 'CREATE_EMPLOYEE_LOAN',
        CREATE_ADVANCE: 'CREATE_EMPLOYEE_LOAN',
        CREATE_LOAN: 'CREATE_EMPLOYEE_LOAN',
        PAYROLL_PREVIEW: 'PREVIEW_PAYROLL',
        HR_ANALYSIS: 'ANALYZE_HR',
        OPEN_REPORT: 'SHOW_REPORT',
        GET_REPORT: 'SHOW_REPORT',
    };
    return aliasMap[normalized] || normalized;
};

const normalizeSingleAction = (raw: any): AIAction | null => {
    if (!raw || typeof raw !== 'object') return null;
    const input = raw.action && typeof raw.action === 'object' ? raw.action : raw;
    const rawType = String(input.type || input.actionType || input.action || '').trim();
    let type = normalizeActionType(rawType);
    if (!type && (input.reportType || input.report || input.view === 'REPORTS')) {
        type = 'SHOW_REPORT';
    }
    if (!type) return null;

    const action: Record<string, any> = { ...input, type };
    if (type === 'CREATE_MENU_ITEM') {
        action.categoryId = action.categoryId || action.category_id || action.sectionId || action.section_id;
        action.data = action.data || {};
        if (!action.data.name && action.name) action.data.name = action.name;
        if (action.data.price === undefined && action.price !== undefined) action.data.price = action.price;
        if (action.data.nameAr === undefined && action.nameAr !== undefined) action.data.nameAr = action.nameAr;
        if (action.data.description === undefined && action.description !== undefined) action.data.description = action.description;
    }
    if (type === 'UPDATE_MENU_ITEM') {
        action.itemId = action.itemId || action.item_id || action.id || action.menuItemId;
        action.data = action.data || {};
        for (const key of ['name', 'nameAr', 'description', 'descriptionAr', 'price', 'isAvailable', 'status', 'preparationTime']) {
            if (action.data[key] === undefined && action[key] !== undefined) action.data[key] = action[key];
        }
    }
    if (type === 'UPDATE_MENU_CATEGORY') {
        action.categoryId = action.categoryId || action.category_id || action.id;
        action.data = action.data || {};
        for (const key of ['name', 'nameAr', 'description', 'color', 'icon', 'image', 'isActive', 'sortOrder']) {
            if (action.data[key] === undefined && action[key] !== undefined) action.data[key] = action[key];
        }
    }
    if (type === 'CREATE_MENU_CATEGORY') {
        action.data = action.data || {};
        if (!action.data.name && action.name) action.data.name = action.name;
        if (action.data.nameAr === undefined && action.nameAr !== undefined) action.data.nameAr = action.nameAr;
        if (action.data.description === undefined && action.description !== undefined) action.data.description = action.description;
    }
    if (type === 'CREATE_USER') {
        action.data = action.data || {};
        for (const key of ['name', 'email', 'role', 'password', 'assignedBranchId', 'permissions']) {
            if (action.data[key] === undefined && action[key] !== undefined) action.data[key] = action[key];
        }
    }
    if (['CREATE_EMPLOYEE', 'CREATE_LEAVE_REQUEST', 'CREATE_BONUS_PENALTY', 'CREATE_EMPLOYEE_LOAN'].includes(type)) {
        action.data = action.data || {};
        for (const key of ['id', 'name', 'email', 'phone', 'role', 'branchId', 'employeeId', 'leaveTypeId', 'startDate', 'endDate', 'reason', 'type', 'category', 'amount', 'effectiveDate', 'principalAmount', 'installmentAmount', 'installmentsCount', 'effectiveFrom', 'notes']) {
            if (action.data[key] === undefined && action[key] !== undefined) action.data[key] = action[key];
        }
    }
    if (type === 'CREATE_CUSTOMER') {
        action.data = action.data || {};
        for (const key of ['name', 'phone', 'email', 'address', 'notes']) {
            if (action.data[key] === undefined && action[key] !== undefined) action.data[key] = action[key];
        }
    }
    return action as AIAction;
};

const normalizeActionList = (rawActions: any): AIAction[] => {
    if (!Array.isArray(rawActions)) return [];
    return rawActions.map((a) => normalizeSingleAction(a)).filter(Boolean) as AIAction[];
};

export const normalizeIncomingAction = (body: any): AIAction => {
    const normalized = normalizeSingleAction(body);
    if (normalized) return normalized;
    const actionType = normalizeActionType(String(body?.actionType || '').trim());
    const parameters = body?.parameters && typeof body.parameters === 'object' ? body.parameters : {};
    return { type: actionType, ...parameters } as AIAction;
};

const loadAiGuardContext = async () => {
    const [inventory, items, categories] = await Promise.all([
        db.select({
            id: inventoryItems.id,
            name: inventoryItems.name,
            threshold: inventoryItems.threshold,
            isActive: inventoryItems.isActive,
        }).from(inventoryItems),
        db.select({
            id: menuItems.id,
            name: menuItems.name,
            categoryId: menuItems.categoryId,
            price: menuItems.price,
            isAvailable: menuItems.isAvailable,
        }).from(menuItems),
        db.select({
            id: menuCategories.id,
            name: menuCategories.name,
        }).from(menuCategories),
    ]);
    return { inventory, menuItems: items, categories };
};

const safeJsonParse = (raw: string) => {
    const text = String(raw || '').trim();
    if (!text) return null;

    // 1) Direct JSON
    try {
        return JSON.parse(text);
    } catch {
        // continue
    }

    // 2) Markdown fenced JSON: ```json ... ```
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced?.[1]) {
        try {
            return JSON.parse(fenced[1].trim());
        } catch {
            // continue
        }
    }

    // 3) Extract object between first "{" and last "}"
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
        const candidate = text.slice(start, end + 1).trim();
        try {
            return JSON.parse(candidate);
        } catch {
            return null;
        }
    }

    return null;
};

const hasArabic = (value: string) => /[\u0600-\u06FF]/.test(String(value || ''));
const hasLatinLetters = (value: string) => /[A-Za-z]/.test(String(value || ''));

const executeMutationAction = async (action: AIAction, user: AuthUser) => {
    switch (action.type) {
        case 'UPDATE_INVENTORY':
        case 'UPDATE_THRESHOLD': {
            const targetId = String((action as any).itemId || (action as any).id || '');
            if (!targetId) throw new Error('ITEM_ID_REQUIRED');
            const incoming = (action as any).data || {};
            const threshold = (action as any).threshold ?? incoming.threshold;
            const patch: Record<string, any> = {
                updatedAt: new Date(),
            };
            if (threshold !== undefined) patch.threshold = Number(threshold);
            if (incoming.name !== undefined) patch.name = String(incoming.name);
            if (incoming.nameAr !== undefined) patch.nameAr = String(incoming.nameAr);
            if (incoming.category !== undefined) patch.category = String(incoming.category);
            if (incoming.costPrice !== undefined) patch.costPrice = Number(incoming.costPrice);
            if (incoming.purchasePrice !== undefined) patch.purchasePrice = Number(incoming.purchasePrice);
            if (incoming.isActive !== undefined) patch.isActive = Boolean(incoming.isActive);

            const [updated] = await db.update(inventoryItems)
                .set(patch)
                .where(eq(inventoryItems.id, targetId))
                .returning();
            if (!updated) throw new Error('ITEM_NOT_FOUND');
            return { entity: 'inventoryItem', id: updated.id, updated };
        }

        case 'UPDATE_MENU_ITEM': {
            const targetId = String((action as any).itemId || '');
            if (!targetId) throw new Error('ITEM_ID_REQUIRED');
            const incoming = (action as any).data || {};
            const patch: Record<string, any> = { updatedAt: new Date() };
            const allowed = ['name', 'nameAr', 'description', 'descriptionAr', 'price', 'isAvailable', 'preparationTime', 'status', 'availableFrom', 'availableTo', 'availableDays', 'modifierGroups', 'printerIds', 'categoryId'];
            for (const key of allowed) {
                if (incoming[key] !== undefined) patch[key] = incoming[key];
            }
            if (patch.price !== undefined) patch.price = Number(patch.price);
            const [updated] = await db.update(menuItems)
                .set(patch)
                .where(eq(menuItems.id, targetId))
                .returning();
            if (!updated) throw new Error('ITEM_NOT_FOUND');
            return { entity: 'menuItem', id: updated.id, updated };
        }

        case 'UPDATE_MENU_PRICE': {
            const targetId = String((action as any).itemId || '');
            const price = Number((action as any).price);
            if (!targetId) throw new Error('ITEM_ID_REQUIRED');
            if (!Number.isFinite(price) || price <= 0) throw new Error('INVALID_PRICE');
            const [existing] = await db.select().from(menuItems).where(eq(menuItems.id, targetId)).limit(1);
            if (!existing) throw new Error('ITEM_NOT_FOUND');
            const [updated] = await db.update(menuItems)
                .set({
                    previousPrice: existing.price,
                    price,
                    priceApprovedBy: user.id,
                    priceApprovedAt: new Date(),
                    updatedAt: new Date(),
                })
                .where(eq(menuItems.id, targetId))
                .returning();
            return { entity: 'menuItem', id: updated.id, updated };
        }

        case 'MARK_ITEM_STATUS': {
            const targetId = String((action as any).itemId || '');
            const status = String((action as any).status || '').trim();
            if (!targetId) throw new Error('ITEM_ID_REQUIRED');
            if (!status) throw new Error('STATUS_REQUIRED');
            const [updated] = await db.update(menuItems)
                .set({ status, updatedAt: new Date() })
                .where(eq(menuItems.id, targetId))
                .returning();
            if (!updated) throw new Error('ITEM_NOT_FOUND');
            return { entity: 'menuItem', id: updated.id, updated };
        }

        case 'CREATE_MENU_ITEM': {
            const categoryId = String((action as any).categoryId || '');
            const data = (action as any).data || {};
            const name = String(data.name || '').trim();
            const price = Number(data.price);
            if (!categoryId) throw new Error('CATEGORY_ID_REQUIRED');
            if (!name) throw new Error('NAME_REQUIRED');
            if (!Number.isFinite(price) || price <= 0) throw new Error('INVALID_PRICE');
            const itemId = String(data.id || `ai-item-${crypto.randomUUID()}`);
            const [created] = await db.insert(menuItems).values({
                id: itemId,
                categoryId,
                name,
                nameAr: data.nameAr,
                description: data.description,
                descriptionAr: data.descriptionAr,
                price,
                isAvailable: data.isAvailable !== false,
                preparationTime: Number(data.preparationTime || 15),
                createdAt: new Date(),
                updatedAt: new Date(),
                status: data.status || 'draft',
                printerIds: Array.isArray(data.printerIds) ? data.printerIds : [],
                modifierGroups: Array.isArray(data.modifierGroups) ? data.modifierGroups : [],
                availableDays: Array.isArray(data.availableDays) ? data.availableDays : [],
            }).returning();
            return { entity: 'menuItem', id: created.id, created };
        }
        case 'CREATE_MENU_CATEGORY': {
            const data = (action as any).data || {};
            const name = String(data.name || '').trim();
            if (!name) throw new Error('CATEGORY_NAME_REQUIRED');
            const categoryId = String(data.id || `ai-category-${crypto.randomUUID()}`);
            const [created] = await db.insert(menuCategories).values({
                id: categoryId,
                name,
                nameAr: data.nameAr || null,
                description: data.description || null,
                icon: data.icon || null,
                image: data.image || null,
                color: data.color || null,
                sortOrder: Number.isFinite(Number(data.sortOrder)) ? Number(data.sortOrder) : 0,
                isActive: data.isActive !== false,
                targetOrderTypes: Array.isArray(data.targetOrderTypes) ? data.targetOrderTypes : [],
                menuIds: Array.isArray(data.menuIds) ? data.menuIds : ['menu-1'],
                printerIds: Array.isArray(data.printerIds) ? data.printerIds : [],
                createdAt: new Date(),
                updatedAt: new Date(),
            }).returning();
            return { entity: 'menuCategory', id: created.id, created };
        }

        case 'UPDATE_MENU_CATEGORY': {
            const targetId = String((action as any).categoryId || (action as any).id || '');
            if (!targetId) throw new Error('CATEGORY_ID_REQUIRED');
            const incoming = (action as any).data || {};
            const patch: Record<string, any> = { updatedAt: new Date() };
            const allowed = ['name', 'nameAr', 'description', 'icon', 'image', 'color', 'sortOrder', 'isActive', 'targetOrderTypes', 'menuIds', 'printerIds'];
            for (const key of allowed) {
                if (incoming[key] !== undefined) patch[key] = incoming[key];
            }
            const [updated] = await db.update(menuCategories)
                .set(patch)
                .where(eq(menuCategories.id, targetId))
                .returning();
            if (!updated) throw new Error('CATEGORY_NOT_FOUND');
            return { entity: 'menuCategory', id: updated.id, updated };
        }

        case 'CREATE_CUSTOMER': {
            const data = (action as any).data || {};
            const name = String(data.name || '').trim();
            const phone = String(data.phone || '').trim();
            if (!name) throw new Error('CUSTOMER_NAME_REQUIRED');
            if (!phone) throw new Error('CUSTOMER_PHONE_REQUIRED');
            const customerId = String(data.id || `ai-customer-${crypto.randomUUID()}`);
            const [created] = await db.insert(customers).values({
                id: customerId,
                name,
                phone,
                email: data.email || null,
                address: data.address || null,
                area: data.area || null,
                building: data.building || null,
                floor: data.floor || null,
                apartment: data.apartment || null,
                landmark: data.landmark || null,
                notes: data.notes || null,
                source: data.source || 'ai_assistant',
                visits: 0,
                totalSpent: 0,
                loyaltyTier: data.loyaltyTier || 'Bronze',
                loyaltyPoints: 0,
                createdAt: new Date(),
                updatedAt: new Date(),
            }).returning();
            return { entity: 'customer', id: created.id, created };
        }
        case 'CREATE_USER': {
            const data = (action as any).data || {};
            const name = String(data.name || '').trim();
            const email = String(data.email || '').trim().toLowerCase();
            const role = String(data.role || 'CASHIER').trim().toUpperCase();
            const password = String(data.password || '').trim();
            if (!name) throw new Error('USER_NAME_REQUIRED');
            if (!email) throw new Error('USER_EMAIL_REQUIRED');
            if (!password || password.length < 6) throw new Error('USER_PASSWORD_MIN_6_REQUIRED');

            const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
            if (exists) throw new Error('USER_EMAIL_ALREADY_EXISTS');

            const bcrypt = await import('bcryptjs');
            const passwordHash = await bcrypt.hash(password, 10);
            const userId = String(data.id || `ai-user-${crypto.randomUUID()}`);
            const [created] = await db.insert(users).values({
                id: userId,
                name,
                email,
                role,
                passwordHash,
                permissions: Array.isArray(data.permissions) ? data.permissions : [],
                assignedBranchId: data.assignedBranchId || data.assigned_branch_id || null,
                isActive: data.isActive !== false,
                createdAt: new Date(),
                updatedAt: new Date(),
            }).returning();
            return {
                entity: 'user',
                id: created.id,
                created: {
                    id: created.id,
                    name: created.name,
                    email: created.email,
                    role: created.role,
                    assignedBranchId: created.assignedBranchId,
                    isActive: created.isActive,
                },
            };
        }
        case 'CREATE_EMPLOYEE': {
            const data = (action as any).data || {};
            const name = String(data.name || '').trim();
            const branchId = String(data.branchId || user.branchId || user.allowedBranches?.[0] || '').trim();
            if (!name) throw new Error('EMPLOYEE_NAME_REQUIRED');
            if (!branchId) throw new Error('BRANCH_ID_REQUIRED');
            const createdRows = await db.insert(employees).values({
                id: String(data.id || `ai-emp-${crypto.randomUUID()}`),
                branchId,
                name,
                email: data.email || null,
                phone: data.phone || null,
                role: String(data.role || 'STAFF'),
                employeeCode: data.employeeCode || null,
                attendanceCode: data.attendanceCode || data.employeeCode || null,
                basicSalary: Number(data.basicSalary || data.salary || 0),
                hourlyRate: Number(data.hourlyRate || 0),
                joinedAt: data.employmentDate ? new Date(data.employmentDate) : new Date(),
                isActive: data.isActive !== false,
            }).returning() as any[];
            const created = createdRows[0];
            return { entity: 'employee', id: created.id, created };
        }

        case 'CREATE_LEAVE_REQUEST': {
            const data = (action as any).data || {};
            const created = await hrExtendedService.createLeaveRequest({
                employeeId: String(data.employeeId || ''),
                employeeName: String(data.employeeName || data.employeeId || ''),
                leaveTypeId: String(data.leaveTypeId || 'LT-ANNUAL'),
                startDate: String(data.startDate || ''),
                endDate: String(data.endDate || data.startDate || ''),
                reason: String(data.reason || 'AI-created leave request'),
            });
            return { entity: 'leaveRequest', id: created.id, created };
        }

        case 'CREATE_BONUS_PENALTY': {
            const data = (action as any).data || {};
            const created = await hrExtendedService.createBonusPenaltyRecord({
                employeeId: String(data.employeeId || ''),
                branchId: String(data.branchId || user.branchId || user.allowedBranches?.[0] || ''),
                type: String(data.type || 'PENALTY').toUpperCase() === 'BONUS' ? 'BONUS' : 'PENALTY',
                category: data.category,
                amount: Number(data.amount || 0),
                effectiveDate: String(data.effectiveDate || new Date().toISOString()),
                reason: String(data.reason || 'AI-created payroll adjustment'),
                notes: data.notes,
                requestedBy: user.id,
            });
            return { entity: 'bonusPenalty', id: created.id, created };
        }

        case 'CREATE_EMPLOYEE_LOAN': {
            const data = (action as any).data || {};
            const created = await hrExtendedService.createEmployeeLoan({
                employeeId: String(data.employeeId || ''),
                branchId: String(data.branchId || user.branchId || user.allowedBranches?.[0] || ''),
                type: data.type || 'ADVANCE',
                principalAmount: Number(data.principalAmount || data.amount || 0),
                installmentAmount: data.installmentAmount !== undefined ? Number(data.installmentAmount) : undefined,
                installmentsCount: data.installmentsCount !== undefined ? Number(data.installmentsCount) : undefined,
                effectiveFrom: data.effectiveFrom || data.effectiveDate || new Date().toISOString(),
                notes: data.notes,
                requestedBy: user.id,
            });
            return { entity: 'employeeLoan', id: created.id, created };
        }

        case 'PREVIEW_PAYROLL': {
            const cycleId = String((action as any).cycleId || (action as any).data?.cycleId || '');
            if (!cycleId) throw new Error('PAYROLL_CYCLE_ID_REQUIRED');
            const preview = await payrollCalculationService.previewCycle(cycleId);
            return { entity: 'payrollPreview', id: cycleId, preview };
        }

        case 'ANALYZE_MENU':
        case 'ANALYZE_INVENTORY':
        case 'ANALYZE_HR':
        case 'RESTOCK_TRIGGER':
        case 'SHOW_REPORT':
            return { entity: 'analysis', id: action.type, message: 'No mutation required for this action type' };

        default:
            throw new Error('UNSAFE_ACTION_TYPE');
    }
};

/**
 * Generate performance insights
 * GET /api/ai/insights
 */
export const getInsights = async (req: Request, res: Response) => {
    try {
        const branchId = req.query.branchId as string;
        const cacheKey = branchId ? `perf_${branchId}` : 'perf_global';

        const insight = await aiService.getCachedInsight(cacheKey, async () => {
            // 1. Gather context data (last 7 days)
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);

            const recentOrders = await db.select().from(orders)
                .where(gte(orders.createdAt, weekAgo));

            const totalRevenue = recentOrders.reduce((s, o) => s + Number(o.total || 0), 0);
            const orderCount = recentOrders.length;
            const avgTicket = orderCount > 0 ? totalRevenue / orderCount : 0;

            // 2. Build prompt
            const prompt = `
                Perform a brief business analysis for a restaurant group. 
                Data for the last 7 days:
                - Total Revenue: ${totalRevenue.toFixed(2)} EGP
                - Order Count: ${orderCount}
                - Average Ticket: ${avgTicket.toFixed(2)} EGP
                
                Provide 3 specific bullet points:
                1. Performance overview
                2. One potential risk
                3. One optimization recommendation
                Keep it concise and professional.
            `;

            return await aiService.queryAI(prompt);
        });

        res.json({ insight });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Execute AI-suggested action
 * POST /api/ai/execute
 */
export const executeAction = async (req: Request, res: Response) => {
    try {
        const action = normalizeIncomingAction(req.body || {});
        const actionType = String(action?.type || '').toUpperCase();
        const user = (req as any).user;
        const auth = evaluateActionAuthorization(user, actionType);
        if (!auth.ok) {
            const status = auth.code === 'AUTH_REQUIRED' ? 401 : auth.code === 'UNSAFE_ACTION_TYPE' ? 400 : 403;
            return res.status(status).json({ error: auth.code, message: auth.message });
        }

        const context = await loadAiGuardContext();
        const guarded = guardAction(action, context);
        if (!guarded.canExecute) {
            return res.status(400).json({ error: 'ACTION_GUARD_BLOCKED', message: guarded.reason || 'Action blocked by guard', guarded });
        }

        const explanation = req.body?.explanation;
        const userName = String((user as any)?.name || user.id || 'unknown');
        await aiService.logAIAction(user.id, userName, `${actionType}_PREVIEW`, {
            action,
            explanation,
            before: guarded.before,
            after: guarded.after,
            status: 'PENDING',
        });

        const result = await executeMutationAction(action, user);

        await aiService.logAIAction(user.id, userName, actionType, {
            action,
            explanation,
            before: guarded.before,
            after: guarded.after,
            status: 'EXECUTED',
            result,
        });

        res.json({
            success: true,
            message: 'Action executed and logged',
            actionId: actionType,
            guarded,
            result,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Chat with AI assistant using backend orchestration.
 * POST /api/ai/chat
 */
export const chatAssistant = async (req: Request, res: Response) => {
    try {
        const body = req.body || {};
        const message = String(body.message || '').trim();
        if (!message) {
            return res.status(400).json({ error: 'MESSAGE_REQUIRED' });
        }
        const lang = String(body.lang || 'en').toLowerCase() === 'ar' ? 'ar' : 'en';
        const context = body.context || {};
        const allowedTypes = new Set(Object.keys(AI_ACTION_SPECS));
        const systemPrompt = `
You are an ERP restaurant assistant.
Respond in ${lang === 'ar' ? 'Arabic' : 'English'}.
Return strict JSON:
{
  "text": "string",
  "actions": [],
  "suggestion": { "label": "string", "view": "DASHBOARD|POS|INVENTORY|REPORTS|SETTINGS|MENU_MANAGER|CRM|FINANCE|AI_INSIGHTS|KDS|TABLES" }
}
Only include actions from this allow-list:
${Object.keys(AI_ACTION_SPECS).join(', ')}
CRITICAL:
- Every action must include exact key "type" with one of the allow-list values.
- Do not invent action names.
- For CREATE_MENU_ITEM include: { "type":"CREATE_MENU_ITEM","categoryId":"...","data":{"name":"...","price":123} }
- For UPDATE_MENU_ITEM include: { "type":"UPDATE_MENU_ITEM","itemId":"...","data":{...patch fields...} }
- For CREATE_MENU_CATEGORY include: { "type":"CREATE_MENU_CATEGORY","data":{"name":"..." } }
- For UPDATE_MENU_CATEGORY include: { "type":"UPDATE_MENU_CATEGORY","categoryId":"...","data":{...patch fields...} }
- For CREATE_USER include: { "type":"CREATE_USER","data":{"name":"...","email":"...","role":"CASHIER","password":"******"} }
- If no executable action is needed, return actions: []
        `.trim();

        const prompt = `
User Message: ${message}
Context summary:
- categories: ${Array.isArray(context.categories) ? context.categories.length : 0}
- menuItems: ${Array.isArray(context.menuItems) ? context.menuItems.length : 0}
- inventory: ${Array.isArray(context.inventory) ? context.inventory.length : 0}
- orders: ${Array.isArray(context.orders) ? context.orders.length : 0}
- category ids sample: ${Array.isArray(context.categories) ? context.categories.slice(0, 8).map((c: any) => `${c.id}:${c.name || c.nameAr || ''}`).join(', ') : ''}
- menu item ids sample: ${Array.isArray(context.menuItems) ? context.menuItems.slice(0, 8).map((i: any) => `${i.id}:${i.name || i.nameAr || ''}`).join(', ') : ''}
Answer with JSON only.
        `.trim();

        const raw = await aiService.queryAI(prompt, systemPrompt);
        let parsed = safeJsonParse(raw);

        // If the model didn't comply (extra prose/markdown), try a single "JSON repair" pass.
        if (!parsed) {
            try {
                const repaired = await aiService.queryAI(
                    `Convert the following response into STRICT JSON only, matching this schema:\n` +
                    `{"text":"string","actions":[],"suggestion":{"label":"string","view":"DASHBOARD|POS|INVENTORY|REPORTS|SETTINGS|MENU_MANAGER|CRM|FINANCE|AI_INSIGHTS|KDS|TABLES"} }\n\n` +
                    `Return JSON only.\n\nResponse:\n${raw}`,
                    'You are a strict JSON formatter. Return JSON only with double quotes, no markdown, no extra text.',
                );
                parsed = safeJsonParse(repaired);
            } catch {
                // keep raw flow below
            }
        }

        if (parsed && typeof parsed === 'object') {
            let text = String((parsed as any).text || '');
            // Language fallback: if user requested Arabic but model responded in English, translate it.
            if (lang === 'ar' && text && !hasArabic(text) && hasLatinLetters(text)) {
                try {
                    const translated = await aiService.queryAI(
                        `Translate this to Arabic only (keep business meaning, concise):\n${text}`,
                        'You are a translator. Return Arabic text only without markdown or JSON.',
                    );
                    if (translated && hasArabic(translated)) {
                        text = translated.trim();
                    }
                } catch {
                    // keep original text
                }
            }
            return res.json({
                text,
                actions: normalizeActionList((parsed as any).actions).filter((a) => allowedTypes.has(String((a as any)?.type || ''))),
                suggestion: (parsed as any).suggestion || null,
            });
        }

        return res.json({
            text: raw,
            actions: [],
            suggestion: null,
        });
    } catch (error: any) {
        const code = String(error?.message || '');
        if (code === 'AI_KEY_MISSING') {
            return res.status(503).json({
                error: code,
                message: 'AI is not configured. Use Local Ollama (recommended, no API key) or add a server/custom key in Settings > AI & Automation.',
            });
        }
        if (code.toLowerCase().includes('free-models-per-day') || code.toLowerCase().includes('free-models-per-min') || code.toLowerCase().includes('rate limit')) {
            return res.status(429).json({
                error: 'AI_RATE_LIMIT',
                message: 'AI free-tier limit reached. Use local Ollama fallback or add OpenRouter credits to continue.',
            });
        }
        if (code.toLowerCase().includes('no endpoints found for')) {
            return res.status(503).json({
                error: 'AI_MODEL_UNAVAILABLE',
                message: 'Selected AI model is currently unavailable. Please switch to Gemini default model in Settings > AI & Automation.',
            });
        }
        res.status(500).json({ error: error.message });
    }
};

export const getAiKeyConfig = async (req: Request, res: Response) => {
    try {
        const config = await aiKeyVaultService.getConfig();
        res.json(config);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'AI_KEY_CONFIG_FAILED' });
    }
};

export const updateAiKeyConfig = async (req: Request, res: Response) => {
    try {
        const source = String(req.body?.source || 'DEFAULT').toUpperCase() === 'CUSTOM' ? 'CUSTOM' : 'DEFAULT';
        const customKey = req.body?.customKey ? String(req.body.customKey) : undefined;
        const model = req.body?.model ? String(req.body.model) : undefined;
        const provider = req.body?.provider ? String(req.body.provider).toUpperCase() : undefined;
        const ollamaModel = req.body?.ollamaModel ? String(req.body.ollamaModel) : undefined;
        const config = await aiKeyVaultService.updateConfig({ source, customKey, model, provider: provider as any, ollamaModel });
        res.json(config);
    } catch (error: any) {
        const code = String(error?.message || '');
        if (code === 'CUSTOM_AI_KEY_REQUIRED') return res.status(400).json({ error: code });
        if (code === 'AI_KEY_ENCRYPTION_SECRET_MISSING') return res.status(500).json({ error: code });
        res.status(500).json({ error: error.message || 'AI_KEY_UPDATE_FAILED' });
    }
};

/**
 * Preview AI action with guard and permission checks.
 * POST /api/ai/action-preview
 */
export const previewAction = async (req: Request, res: Response) => {
    try {
        const action = normalizeIncomingAction(req.body || {});
        const actionType = String(action?.type || '').toUpperCase();
        const user = (req as any).user;

        const auth = evaluateActionAuthorization(user, actionType);
        if (!auth.ok) {
            const status = auth.code === 'AUTH_REQUIRED' ? 401 : auth.code === 'UNSAFE_ACTION_TYPE' ? 400 : 403;
            return res.status(status).json({ error: auth.code, message: auth.message });
        }

        const context = await loadAiGuardContext();
        const guarded = guardAction(action, context);
        if (guarded.permission && !hasPermission(user, guarded.permission)) {
            guarded.canExecute = false;
            guarded.reason = 'Missing required permission';
        }

        res.json({ guarded, allowed: guarded.canExecute });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
/**
 * Get revenue forecast
 * GET /api/ai/forecast
 */
export const getRevenueForecast = async (req: Request, res: Response) => {
    try {
        const branchId = req.query.branchId as string;
        const data = await revenueForecastService.getRevenueForecast(branchId);
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
