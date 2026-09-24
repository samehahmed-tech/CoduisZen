import { Request, Response } from 'express';
import { db } from '../db';
import { inventoryItems, menuCategories, menuItems, recipeIngredients, recipes } from '../../src/db/schema';
import { calculateRecipeCost } from '../../utils/menuCost';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { getStringParam } from '../utils/request';
import { pool } from '../db';
import { dbCacheService } from '../services/dbCacheService';
import { createSignedAuditLog } from '../services/auditService';
import { randomUUID } from 'node:crypto';

const tableColumnsCache = new Map<string, Set<string>>();

const getTableColumns = async (tableName: string): Promise<Set<string>> => {
    const cacheKey = tableName.toLowerCase();
    const cached = tableColumnsCache.get(cacheKey);
    if (cached) return cached;

    const result = await pool.query(
        `select column_name
         from information_schema.columns
         where table_schema = SCHEMA_NAME()
           and table_name = $1`,
        [cacheKey],
    );

    const columns = new Set<string>(result.rows.map((r) => String(r.column_name)));
    tableColumnsCache.set(cacheKey, columns);
    return columns;
};

const hasAnyColumn = (columns: Set<string>) => columns.size > 0;
const hasColumn = (columns: Set<string>, name: string) => columns.has(name);

const compatSelect = (columns: Set<string>, columnName: string, alias: string, fallbackSql: string) =>
    hasColumn(columns, columnName)
        ? `${columnName} as "${alias}"`
        : `${fallbackSql} as "${alias}"`;

const readCategoriesCompat = async () => {
    const columns = await getTableColumns('menu_categories');
    if (!hasAnyColumn(columns)) {
        return [];
    }

    const selectParts = [
        compatSelect(columns, 'id', 'id', `''`),
        compatSelect(columns, 'name', 'name', `''`),
        compatSelect(columns, 'name_ar', 'nameAr', `NULL`),
        compatSelect(columns, 'description', 'description', `NULL`),
        compatSelect(columns, 'icon', 'icon', `NULL`),
        compatSelect(columns, 'image', 'image', `NULL`),
        compatSelect(columns, 'color', 'color', `NULL`),
        compatSelect(columns, 'sort_order', 'sortOrder', `0`),
        compatSelect(columns, 'is_active', 'isActive', `1`),
        compatSelect(columns, 'target_order_types', 'targetOrderTypes', `'[]'`),
        compatSelect(columns, 'menu_ids', 'menuIds', `'[]'`),
        compatSelect(columns, 'printer_ids', 'printerIds', `'[]'`),
        compatSelect(columns, 'created_at', 'createdAt', `GETDATE()`),
        compatSelect(columns, 'updated_at', 'updatedAt', `GETDATE()`),
    ];

    const query = `
        select ${selectParts.join(', ')}
        from menu_categories
        order by sort_order, name
    `;

    const result = await pool.query(query);
    return result.rows;
};

const readRecipesCompat = async () => {
    const columns = await getTableColumns('recipes');
    if (!hasAnyColumn(columns)) return [];

    const selectParts = [
        compatSelect(columns, 'id', 'id', `''`),
        compatSelect(columns, 'menu_item_id', 'menuItemId', `NULL`),
        compatSelect(columns, 'inventory_item_id', 'inventoryItemId', `NULL`),
        compatSelect(columns, 'yield', 'yield', `1`),
        compatSelect(columns, 'size_id', 'sizeId', `NULL`),
        compatSelect(columns, 'instructions', 'instructions', `NULL`),
        compatSelect(columns, 'version', 'version', `1`),
        compatSelect(columns, 'current_version_id', 'currentVersionId', `NULL`),
        compatSelect(columns, 'calculated_cost', 'calculatedCost', `NULL`),
        compatSelect(columns, 'last_cost_calculation', 'lastCostCalculation', `NULL`),
        compatSelect(columns, 'created_at', 'createdAt', `GETDATE()`),
        compatSelect(columns, 'updated_at', 'updatedAt', `GETDATE()`),
    ];

    const result = await pool.query(`
        select ${selectParts.join(', ')}
        from recipes
    `);
    return result.rows;
};

const readRecipeIngredientsCompat = async () => {
    const columns = await getTableColumns('recipe_ingredients');
    if (!hasAnyColumn(columns)) return [];

    const selectParts = [
        compatSelect(columns, 'id', 'id', `0`),
        compatSelect(columns, 'recipe_id', 'recipeId', `NULL`),
        compatSelect(columns, 'inventory_item_id', 'inventoryItemId', `NULL`),
        compatSelect(columns, 'quantity', 'quantity', `0`),
        compatSelect(columns, 'unit', 'unit', `''`),
        compatSelect(columns, 'notes', 'notes', `NULL`),
    ];

    const result = await pool.query(`
        select ${selectParts.join(', ')}
        from recipe_ingredients
    `);
    return result.rows;
};

const getMenuCacheVersion = async () => {
    const result = await pool.query(`
        SELECT CAST(
            (SELECT MAX(v) FROM (VALUES
                (COALESCE((SELECT MAX(updated_at) FROM menu_categories), '1970-01-01')),
                (COALESCE((SELECT MAX(updated_at) FROM menu_items), '1970-01-01')),
                (COALESCE((SELECT MAX(updated_at) FROM recipes), '1970-01-01'))
            ) AS vals(v))
        AS NVARCHAR(MAX)) AS version
    `);
    return result.rows[0]?.version || 'epoch';
};

const sanitizeCategoryPayload = async (payload: Record<string, any>) => {
    const columns = await getTableColumns('menu_categories');
    const sanitized = { ...payload };

    if (!columns.has('target_order_types')) delete sanitized.targetOrderTypes;
    if (!columns.has('menu_ids')) delete sanitized.menuIds;
    if (!columns.has('printer_ids')) delete sanitized.printerIds;

    return sanitized;
};

const menuItemSelect = {
    id: menuItems.id,
    categoryId: menuItems.categoryId,
    name: menuItems.name,
    nameAr: menuItems.nameAr,
    description: menuItems.description,
    descriptionAr: menuItems.descriptionAr,
    price: menuItems.price,
    cost: menuItems.cost,
    image: menuItems.image,
    status: menuItems.status,
    approvedBy: menuItems.approvedBy,
    approvedAt: menuItems.approvedAt,
    publishedAt: menuItems.publishedAt,
    previousPrice: menuItems.previousPrice,
    pendingPrice: menuItems.pendingPrice,
    priceChangeReason: menuItems.priceChangeReason,
    priceApprovedBy: menuItems.priceApprovedBy,
    priceApprovedAt: menuItems.priceApprovedAt,
    isAvailable: menuItems.isAvailable,
    availableFrom: menuItems.availableFrom,
    availableTo: menuItems.availableTo,
    availableDays: menuItems.availableDays,
    modifierGroups: menuItems.modifierGroups,
    sizes: menuItems.sizes,
    branchPricing: menuItems.branchPricing,
    platformPricing: menuItems.platformPricing,
    preparationTime: menuItems.preparationTime,
    printerIds: menuItems.printerIds,
    isPopular: menuItems.isPopular,
    isFeatured: menuItems.isFeatured,
    sortOrder: menuItems.sortOrder,
    layoutType: menuItems.layoutType,
    barcode: menuItems.barcode,
    sku: menuItems.sku,
    createdAt: menuItems.createdAt,
    updatedAt: menuItems.updatedAt,
};

// --- Categories ---
export const getAllCategories = async (req: Request, res: Response) => {
    try {
        const categories = await dbCacheService.getOrFetch('menu:categories:all', async () => {
            return await readCategoriesCompat();
        }, { staleWhileRevalidate: true, ttlMs: 60 * 60 * 1000 });

        res.json(categories);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const createCategory = async (req: Request, res: Response) => {
    try {
        const safePayload = await sanitizeCategoryPayload(req.body || {});
        const category = await db.insert(menuCategories).output().values({
            ...(safePayload as any),
            isActive: req.body.isActive !== false,
            createdAt: new Date(),
            updatedAt: new Date(),
        } as any);
        dbCacheService.invalidatePattern('menu:');
        res.status(201).json(category[0]);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const updateCategory = async (req: Request, res: Response) => {
    try {
        const id = getStringParam((req.params as any).id);
        if (!id) return res.status(400).json({ error: 'CATEGORY_ID_REQUIRED' });
        const { id: _, ...rawUpdateData } = req.body; // Prevent updating ID
        const updateData = await sanitizeCategoryPayload(rawUpdateData);
        const updated = await db.update(menuCategories)
            .set({ ...(updateData as any), updatedAt: new Date() } as any)
            .output()
            .where(eq(menuCategories.id, id));

        if (updated.length === 0) return res.status(404).json({ error: 'Category not found' });
        dbCacheService.invalidatePattern('menu:');
        res.json(updated[0]);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const deleteCategory = async (req: Request, res: Response) => {
    try {
        const id = getStringParam((req.params as any).id);
        if (!id) return res.status(400).json({ error: 'CATEGORY_ID_REQUIRED' });

        // Remove category reference from items to avoid foreign key violations
        await db.update(menuItems)
            .set({ categoryId: null } as any)
            .where(eq(menuItems.categoryId, id));

        // Now safe to delete the category
        await db.delete(menuCategories).where(eq(menuCategories.id, id));
        dbCacheService.invalidatePattern('menu:');
        res.json({ message: 'Category deleted successfully' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

// --- Items ---
export const getMenuItems = async (req: Request, res: Response) => {
    try {
        const category_id = getStringParam(req.query.category_id);
        const available_only = getStringParam(req.query.available_only);

        const cacheKey = `menu:items:${category_id || 'all'}:${available_only || 'false'}`;

        const items = await dbCacheService.getOrFetch(cacheKey, async () => {
            const conditions: any[] = [];
            if (available_only === 'true') conditions.push(eq(menuItems.isAvailable, true));
            if (category_id) conditions.push(eq(menuItems.categoryId, category_id));

            const query = conditions.length
                ? db.select(menuItemSelect).from(menuItems).where(and(...conditions))
                : db.select(menuItemSelect).from(menuItems);

            return await query.orderBy(menuItems.sortOrder, menuItems.name);
        }, { staleWhileRevalidate: true, ttlMs: 15 * 60 * 1000 });

        res.json(items);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

const normalizeIncomingRecipes = (recipesData: any) => {
    if (!Array.isArray(recipesData) || recipesData.length === 0) return [];
    // Size-keyed format: [{ sizeId, yield, instructions, ingredients: [...] }]
    if (recipesData[0] && Array.isArray((recipesData[0] as any).ingredients)) {
        return recipesData.map((r: any) => ({
            sizeId: r.sizeId ?? null,
            yield: Number(r.yield) > 0 ? Number(r.yield) : 1,
            instructions: r.instructions || null,
            ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
        }));
    }
    // Legacy flat format: [{ itemId, quantity, unit }]
    return [{ sizeId: null, yield: 1, instructions: null, ingredients: recipesData }];
};

const saveRecipeForItem = async (menuItemId: string, recipesData: any) => {
    const recipeColumns = await getTableColumns('recipes');
    if (!recipeColumns.has('id') || !recipeColumns.has('menu_item_id')) return { recipes: [], baseCost: 0 };

    const normalizedRecipes = normalizeIncomingRecipes(recipesData);

    // Empty array => explicit clear request (only when caller really means it).
    if (normalizedRecipes.length === 0 || (normalizedRecipes.length === 1 && normalizedRecipes[0].ingredients.length === 0 && !recipesData)) {
        const existingRecipes = await pool.query('select id from recipes where menu_item_id = $1', [menuItemId]);
        const recipeIds = existingRecipes.rows.map((r) => r.id);
        if (recipeIds.length > 0) {
            const ingredientColumns = await getTableColumns('recipe_ingredients');
            if (ingredientColumns.has('recipe_id')) {
                const placeholders = recipeIds.map((_, i) => `$${i + 1}`).join(', ');
                await pool.query(`delete from recipe_ingredients where recipe_id in (${placeholders})`, recipeIds);
            }
            const placeholders = recipeIds.map((_, i) => `$${i + 1}`).join(', ');
            await pool.query(`delete from recipes where id in (${placeholders})`, recipeIds);
        }
        await pool.query('update menu_items set cost = 0, updated_at = GETDATE() where id = $1', [menuItemId]).catch(() => {});
        dbCacheService.invalidatePattern('menu:');
        return { recipes: [], baseCost: 0 };
    }

    // 1) Validate EVERYTHING first (no deletes yet — a bad row must never wipe the last good BOM).
    const wantedIds = new Set<string>();
    for (const rData of normalizedRecipes) {
        const y = Number(rData.yield);
        if (rData.yield !== undefined && rData.yield !== null && (!Number.isFinite(y) || y <= 0)) throw new Error('RECIPE_YIELD_INVALID');
        if (!Array.isArray(rData.ingredients) || rData.ingredients.length === 0) throw new Error('RECIPE_EMPTY_INGREDIENTS');
        for (const ingredient of rData.ingredients) {
            const ingredientId = ingredient.itemId || ingredient.inventoryItemId;
            const quantity = Number(ingredient.quantity);
            if (!ingredientId) throw new Error('RECIPE_INGREDIENT_ITEM_REQUIRED');
            if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('RECIPE_INGREDIENT_QUANTITY_INVALID');
            wantedIds.add(String(ingredientId));
        }
    }
    if (wantedIds.size > 0) {
        const ids = [...wantedIds];
        const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
        const found = await pool.query(`select id, is_active, cost_price, unit from inventory_items where id in (${placeholders})`, ids);
        const foundMap = new Map(found.rows.map((r: any) => [String(r.id), r]));
        for (const id of ids) {
            const row = foundMap.get(id);
            if (!row) throw new Error('RECIPE_INGREDIENT_ITEM_NOT_FOUND');
            if (row.is_active === false || row.is_active === 0) throw new Error('RECIPE_INGREDIENT_ITEM_INACTIVE');
        }
        // Cost lookup for syncing menu_items.cost
        var costByItem = new Map<string, number>(found.rows.map((r: any) => [String(r.id), Number(r.cost_price || 0)]));
    }

    // 2) Insert the NEW BOM first with fresh ids, then delete the old rows.
    //    If any insert fails the old recipes are still intact.
    const ingredientColumns = await getTableColumns('recipe_ingredients');
    const newRecipeIds: string[] = [];
    const stamp = Date.now().toString(36);
    for (const rData of normalizedRecipes) {
        const recipeId = `recipe-${menuItemId}-${rData.sizeId || 'base'}-${stamp}-${newRecipeIds.length}`;
        const recipeInsert: Record<string, any> = {
            id: recipeId,
            menu_item_id: menuItemId,
            size_id: rData.sizeId || null,
            yield: Number(rData.yield) > 0 ? Number(rData.yield) : 1,
            instructions: rData.instructions || null,
            version: 1,
            created_at: new Date(),
            updated_at: new Date(),
        };
        const recipeKeys = Object.keys(recipeInsert).filter((key) => recipeColumns.has(key));
        await pool.query(
            `insert into recipes (${recipeKeys.join(', ')}) values (${recipeKeys.map((_, i) => `$${i + 1}`).join(', ')})`,
            recipeKeys.map((key) => recipeInsert[key]),
        );
        newRecipeIds.push(recipeId);

        for (const ingredient of rData.ingredients) {
            const quantity = Number(ingredient.quantity);
            const ingredientInsert: Record<string, any> = {
                recipe_id: recipeId,
                inventory_item_id: ingredient.itemId || ingredient.inventoryItemId,
                quantity,
                unit: ingredient.unit || 'unit',
            };
            const ingredientKeys = Object.keys(ingredientInsert).filter((key) => ingredientColumns.has(key));
            if (ingredientKeys.length === 0) continue;
            await pool.query(
                `insert into recipe_ingredients (${ingredientKeys.join(', ')}) values (${ingredientKeys.map((_, i) => `$${i + 1}`).join(', ')})`,
                ingredientKeys.map((key) => ingredientInsert[key]),
            );
        }
    }

    // 3) New BOM is safely stored — now remove the old rows.
    const existingRecipes = await pool.query('select id from recipes where menu_item_id = $1', [menuItemId]);
    const oldIds = existingRecipes.rows.map((r) => r.id).filter((id: string) => !newRecipeIds.includes(id));
    if (oldIds.length > 0) {
        if (ingredientColumns.has('recipe_id')) {
            const placeholders = oldIds.map((_, i) => `$${i + 1}`).join(', ');
            await pool.query(`delete from recipe_ingredients where recipe_id in (${placeholders})`, oldIds);
        }
        const placeholders = oldIds.map((_, i) => `$${i + 1}`).join(', ');
        await pool.query(`delete from recipes where id in (${placeholders})`, oldIds);
    }

    // 4) Sync base cost onto the menu item so cards/margins are correct even without a join.
    try {
        const base = normalizedRecipes.find((r: any) => !r.sizeId) || normalizedRecipes[0];
        const y = Number(base?.yield) > 0 ? Number(base.yield) : 1;
        let baseCost = 0;
        for (const ing of base?.ingredients || []) {
            const id = String(ing.itemId || ing.inventoryItemId);
            baseCost += (costByItem!.get(id) || 0) * Number(ing.quantity || 0);
        }
        baseCost = baseCost / y;
        await pool.query('update menu_items set cost = $1, updated_at = GETDATE() where id = $2', [baseCost, menuItemId]).catch(() => {});
        dbCacheService.invalidatePattern('menu:');
        return { recipes: normalizedRecipes, baseCost };
    } catch {
        dbCacheService.invalidatePattern('menu:');
        return { recipes: normalizedRecipes, baseCost: 0 };
    }
};


export const createItem = async (req: Request, res: Response) => {
    try {
        const { recipe, ...itemPayload } = req.body;
        const normalizedName = itemPayload.name.trim().toLowerCase();
        // Names are unique within their category — the same dish may
        // legitimately appear in several sections.
        const nameDupConditions: any[] = [
            sql`LOWER(LTRIM(RTRIM(${menuItems.name}))) = ${normalizedName}`,
            sql`${menuItems.deletedAt} IS NULL`,
        ];
        if (itemPayload.categoryId) {
            nameDupConditions.push(eq(menuItems.categoryId, itemPayload.categoryId));
        }
        const [duplicateName] = await db.select({ id: menuItems.id })
            .from(menuItems)
            .where(and(...nameDupConditions));

        if (duplicateName) {
            return res.status(409).json({
                code: 'MENU_ITEM_NAME_EXISTS',
                message: 'An item with the same name already exists in this section.',
                messageAr: 'يوجد صنف بنفس الاسم في نفس القسم.',
            });
        }

        const sku = `ITM-${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
        const item = await db.insert(menuItems).output().values({
            ...itemPayload,
            id: `item-${randomUUID()}`,
            name: itemPayload.name.trim(),
            sku,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        if (Array.isArray(recipe) && recipe.length > 0 && item[0]) {
            try {
                await saveRecipeForItem(item[0].id, recipe);
            } catch (recipeError: any) {
                const code = String(recipeError?.message || 'RECIPE_SAVE_FAILED');
                dbCacheService.invalidatePattern('menu:');
                return res.status(code.startsWith('RECIPE_') ? 422 : 500).json({
                    code,
                    message: code,
                    messageAr: 'تم إنشاء الصنف لكن تعذر حفظ الوصفة.',
                    item: item[0],
                });
            }
        }

        dbCacheService.invalidatePattern('menu:');
        res.status(201).json(item[0]);
    } catch (error: any) {
        const errorNumber = error?.number ?? error?.originalError?.number;
        if (errorNumber === 2601 || errorNumber === 2627) {
            return res.status(409).json({
                code: 'MENU_ITEM_DUPLICATE',
                message: 'Item name or code already exists.',
                messageAr: 'اسم الصنف أو كوده موجود بالفعل.',
            });
        }
        res.status(500).json({ error: error.message });
    }
};

export const updateItem = async (req: Request, res: Response) => {
    try {
        const id = getStringParam((req.params as any).id);
        if (!id) return res.status(400).json({ error: 'ITEM_ID_REQUIRED' });
        const { id: _, category_id, recipe, restore, ...updateData } = req.body; // Prevent updating ID

        const [existingItem] = await db.select({ id: menuItems.id, categoryId: menuItems.categoryId })
            .from(menuItems)
            .where(eq(menuItems.id, id));
        if (!existingItem) return res.status(404).json({ error: 'Item not found' });

        if (updateData.name) {
            const normalizedName = updateData.name.trim().toLowerCase();
            // Names are unique within their category (target on moves).
            const targetCategoryId = (updateData as any).categoryId || category_id || existingItem.categoryId;
            const nameDupConditions: any[] = [
                sql`LOWER(LTRIM(RTRIM(${menuItems.name}))) = ${normalizedName}`,
                sql`${menuItems.id} <> ${id}`,
                sql`${menuItems.deletedAt} IS NULL`,
            ];
            if (targetCategoryId) {
                nameDupConditions.push(eq(menuItems.categoryId, targetCategoryId));
            }
            const [duplicateName] = await db.select({ id: menuItems.id })
                .from(menuItems)
                .where(and(...nameDupConditions));
            if (duplicateName) {
                return res.status(409).json({
                    code: 'MENU_ITEM_NAME_EXISTS',
                    message: 'An item with the same name already exists in this section.',
                    messageAr: 'يوجد صنف بنفس الاسم في نفس القسم.',
                });
            }
            updateData.name = updateData.name.trim();
        }
        if (updateData.sku) {
            const [duplicateSku] = await db.select({ id: menuItems.id })
                .from(menuItems)
                .where(and(
                    eq(menuItems.sku, updateData.sku.trim()),
                    sql`${menuItems.id} <> ${id}`,
                    sql`${menuItems.deletedAt} IS NULL`,
                ));
            if (duplicateSku) {
                return res.status(409).json({
                    code: 'MENU_ITEM_SKU_EXISTS',
                    message: 'Item code already exists.',
                    messageAr: 'كود الصنف موجود بالفعل.',
                });
            }
            updateData.sku = updateData.sku.trim();
        }
        const cleanUpdate: Record<string, any> = {};
        for (const [k, v] of Object.entries(updateData)) if (v !== undefined) cleanUpdate[k] = v;
        const updated = await db.update(menuItems)
            .set({
                ...cleanUpdate,
                categoryId: category_id || (updateData as any).categoryId,
                ...(restore ? { deletedAt: null } : {}),
                updatedAt: new Date()
            })
            .output()
            .where(eq(menuItems.id, id));

        if (updated.length === 0) return res.status(404).json({ error: 'Item not found' });

        // Only rewrite recipes when a non-empty payload arrives. Editors that
        // are unaware of recipes send `[]`, which must never wipe saved
        // size-specific BOMs.
        if (Array.isArray(recipe) && recipe.length > 0) {
            try {
                await saveRecipeForItem(id, recipe);
            } catch (recipeError: any) {
                const code = String(recipeError?.message || 'RECIPE_SAVE_FAILED');
                const status = code.startsWith('RECIPE_') ? 422 : 500;
                dbCacheService.invalidatePattern('menu:');
                return res.status(status).json({
                    code,
                    message: code,
                    messageAr: 'تعذر حفظ الوصفة — راجع المكونات والكميات ثم حاول مجدداً.',
                    item: updated[0],
                });
            }
        }

        const userId = (req as any).user?.id || 'system';
        await createSignedAuditLog({
            eventType: 'MENU_ITEM_UPDATED',
            userId,
            branchId: null,
            payload: { itemId: id, updates: updateData },
            reason: 'Menu item updated via POS or Dashboard',
            sourceDevice: req.headers['user-agent'] || 'unknown',
            requestId: req.headers['x-request-id'] as string || `req-${Date.now()}`
        });

        dbCacheService.invalidatePattern('menu:');
        res.json(updated[0]);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const deleteItem = async (req: Request, res: Response) => {
    try {
        const id = getStringParam((req.params as any).id);
        if (!id) return res.status(400).json({ error: 'ITEM_ID_REQUIRED' });

        const columns = await getTableColumns('menu_items');
        const normalizedColumns = new Set([...columns].map((c) => c.toLowerCase()));
        const [existing] = await db.select({ id: menuItems.id })
            .from(menuItems)
            .where(eq(menuItems.id, id));
        if (!existing) {
            return res.status(404).json({
                error: 'MENU_ITEM_NOT_FOUND',
                code: 'MENU_ITEM_NOT_FOUND',
                message: 'Menu item was not found.',
            });
        }

        const patch: Record<string, any> = { isAvailable: false };
        if (normalizedColumns.has('deleted_at')) (patch as any).deletedAt = new Date();
        if (normalizedColumns.has('updated_at')) (patch as any).updatedAt = new Date();
        if (normalizedColumns.has('status')) (patch as any).status = 'archived';

        const archived = await db.update(menuItems)
            .set(patch as any)
            .output()
            .where(eq(menuItems.id, id));

        dbCacheService.invalidatePattern('menu:');
        res.json({
            message: 'Item archived successfully',
            archived: true,
            item: (archived as any[])[0] ?? (archived as any)?.rows?.[0],
        });
    } catch (error: any) {
        res.status(500).json({
            error: 'MENU_ITEM_DELETE_FAILED',
            code: 'MENU_ITEM_DELETE_FAILED',
            message: 'Menu item could not be archived. Refresh the menu and try again.',
            details: process.env.NODE_ENV === 'production' ? undefined : error.message,
        });
    }
};

export const getFullMenu = async (req: Request, res: Response) => {
    try {
        const available_only = getStringParam(req.query.available_only);
        const cacheVersion = await getMenuCacheVersion();

        const cacheKey = `menu:full:${available_only || 'false'}:${cacheVersion}`;

        const fullMenu = await dbCacheService.getOrFetch(cacheKey, async () => {
            // Get all categories
            const categories = await readCategoriesCompat();

            // Get items
            let items;
            if (available_only === 'true') {
                items = await db.select(menuItemSelect).from(menuItems)
                    .where(and(
                        eq(menuItems.isAvailable, true),
                        eq(menuItems.status, 'published')
                    ))
                    .orderBy(menuItems.sortOrder);
            } else {
                items = await db.select(menuItemSelect).from(menuItems)
                    .orderBy(menuItems.sortOrder);
            }

            // Get recipes and ingredients
            const recipeList = await readRecipesCompat();
            const ingredientList = await readRecipeIngredientsCompat();
            const inventoryCostRows = await db.select({ id: inventoryItems.id, costPrice: inventoryItems.costPrice }).from(inventoryItems);
            const inventoryCosts = new Map(inventoryCostRows.map((row) => [row.id, Number(row.costPrice || 0)]));
            const ingredientsByRecipe = new Map<string, any[]>();
            for (const ingredient of ingredientList) {
                const list = ingredientsByRecipe.get(ingredient.recipeId) || [];
                list.push({
                    itemId: ingredient.inventoryItemId,
                    inventoryItemId: ingredient.inventoryItemId,
                    quantity: ingredient.quantity,
                    unit: ingredient.unit,
                    notes: ingredient.notes,
                });
                ingredientsByRecipe.set(ingredient.recipeId, list);
            }

            const recipesByItem = new Map<string, any[]>();
            for (const r of recipeList) {
                const rIngredients = ingredientsByRecipe.get(r.id) || [];
                
                if (!recipesByItem.has(r.menuItemId!)) {
                    recipesByItem.set(r.menuItemId!, []);
                }
                recipesByItem.get(r.menuItemId!)!.push({
                    id: r.id,
                    sizeId: r.sizeId,
                    yield: Number(r.yield || 1),
                    instructions: r.instructions || null,
                    ingredients: rIngredients
                });
            }

            const itemsWithRecipes = items.map(item => {
                const recipe = recipesByItem.get(item.id) || [];
                const sizes = Array.isArray(item.sizes)
                    ? item.sizes.map((size: any) => ({ ...size, cost: calculateRecipeCost(recipe, inventoryCosts, size.id) }))
                    : item.sizes;
                return {
                    ...item,
                    sizes,
                    cost: recipe.length ? calculateRecipeCost(recipe, inventoryCosts, null) : Number(item.cost || 0),
                    recipe,
                };
            });

            return categories.map(cat => ({
                ...cat,
                items: itemsWithRecipes.filter(item => item.categoryId === cat.id)
            }));
        }, { staleWhileRevalidate: true, ttlMs: 15 * 60 * 1000 });

        res.json(fullMenu);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

// --- Lifecycle Workflow ---

/**
 * Approve a menu item (moves from draft/pending_approval -> approved)
 * POST /api/menu/items/:id/approve
 */
export const approveItem = async (req: Request, res: Response) => {
    try {
        const id = getStringParam((req.params as any).id);
        if (!id) return res.status(400).json({ error: 'ITEM_ID_REQUIRED' });

        const userId = (req as any).user?.id;

        const updated = await db.update(menuItems)
            .set({
                status: 'approved',
                approvedBy: userId,
                approvedAt: new Date(),
                updatedAt: new Date(),
            })
            .output()
            .where(eq(menuItems.id, id));

        if (updated.length === 0) return res.status(404).json({ error: 'Item not found' });

        await createSignedAuditLog({
            eventType: 'MENU_ITEM_APPROVED',
            userId: userId || 'system',
            branchId: null,
            payload: { itemId: id },
            reason: 'Menu item approved',
            sourceDevice: req.headers['user-agent'] || 'unknown',
            requestId: req.headers['x-request-id'] as string || `req-${Date.now()}`
        });

        dbCacheService.invalidatePattern('menu:');
        res.json(updated[0]);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Publish a menu item (makes it live on POS)
 * POST /api/menu/items/:id/publish
 */
export const publishItem = async (req: Request, res: Response) => {
    try {
        const id = getStringParam((req.params as any).id);
        if (!id) return res.status(400).json({ error: 'ITEM_ID_REQUIRED' });

        const updated = await db.update(menuItems)
            .set({
                status: 'published',
                publishedAt: new Date(),
                updatedAt: new Date(),
            })
            .output()
            .where(eq(menuItems.id, id));

        if (updated.length === 0) return res.status(404).json({ error: 'Item not found' });
        dbCacheService.invalidatePattern('menu:');
        res.json(updated[0]);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Request a price change (requires approval before taking effect)
 * POST /api/menu/items/:id/request-price-change
 */
export const requestPriceChange = async (req: Request, res: Response) => {
    try {
        const id = getStringParam((req.params as any).id);
        if (!id) return res.status(400).json({ error: 'ITEM_ID_REQUIRED' });

        const { newPrice, reason } = req.body;
        if (!newPrice) return res.status(400).json({ error: 'NEW_PRICE_REQUIRED' });

        const [existing] = await db.select().from(menuItems).where(eq(menuItems.id, id));
        if (!existing) return res.status(404).json({ error: 'Item not found' });

        const updated = await db.update(menuItems)
            .set({
                previousPrice: existing.price,
                pendingPrice: newPrice,
                priceChangeReason: reason,
                updatedAt: new Date(),
            })
            .output()
            .where(eq(menuItems.id, id));

        dbCacheService.invalidatePattern('menu:');
        res.json({ ...updated[0], message: 'Price change requested, awaiting approval' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Approve a pending price change (applies the new price)
 * POST /api/menu/items/:id/approve-price
 */
export const approvePriceChange = async (req: Request, res: Response) => {
    try {
        const id = getStringParam((req.params as any).id);
        if (!id) return res.status(400).json({ error: 'ITEM_ID_REQUIRED' });

        const userId = (req as any).user?.id;

        const [existing] = await db.select().from(menuItems).where(eq(menuItems.id, id));
        if (!existing) return res.status(404).json({ error: 'Item not found' });
        if (!existing.pendingPrice) return res.status(400).json({ error: 'NO_PENDING_PRICE_CHANGE' });

        const updated = await db.update(menuItems)
            .set({
                price: existing.pendingPrice,
                pendingPrice: null,
                priceApprovedBy: userId,
                priceApprovedAt: new Date(),
                updatedAt: new Date(),
            })
            .output()
            .where(eq(menuItems.id, id));

        await createSignedAuditLog({
            eventType: 'MENU_ITEM_PRICE_APPROVED',
            userId,
            branchId: null,
            payload: {
                itemId: id,
                oldPrice: existing.price,
                newPrice: existing.pendingPrice
            },
            reason: 'Pending price change approved',
            sourceDevice: req.headers['user-agent'] || 'unknown',
            requestId: req.headers['x-request-id'] as string || `req-${Date.now()}`
        });

        dbCacheService.invalidatePattern('menu:');
        res.json({ ...updated[0], message: 'Price change approved and applied' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Copy a branch price list (branchPricing entries, all channels) from one
 * branch to another — e.g. onboarding a new branch from an existing one.
 * POST /api/menu/branch-pricing/copy { fromBranchId, toBranchId, overwrite? }
 * Warn-only domain: skips items that already have a target entry unless
 * overwrite=true. Audited per chain pricing accountability.
 */
export const copyBranchPricing = async (req: Request, res: Response) => {
    try {
        const fromBranchId = String(req.body?.fromBranchId || '').trim();
        const toBranchId = String(req.body?.toBranchId || '').trim();
        const overwrite = req.body?.overwrite === true;
        if (!fromBranchId || !toBranchId) {
            return res.status(400).json({ error: 'BRANCH_IDS_REQUIRED', code: 'BRANCH_IDS_REQUIRED' });
        }
        if (fromBranchId === toBranchId) {
            return res.status(400).json({ error: 'SAME_BRANCH', code: 'SAME_BRANCH' });
        }
        const items = await db.select({ id: menuItems.id, branchPricing: menuItems.branchPricing }).from(menuItems);
        let updatedItems = 0;
        let copiedEntries = 0;
        let skippedEntries = 0;
        for (const item of items) {
            const current: any[] = Array.isArray(item.branchPricing) ? item.branchPricing : [];
            const source = current.filter((e: any) => String(e?.branchId ?? e?.branch_id ?? '') === fromBranchId);
            if (source.length === 0) continue;
            let next = [...current];
            let changed = false;
            for (const entry of source) {
                const channel = entry?.channel ? String(entry.channel).toUpperCase() : undefined;
                const idx = next.findIndex((e: any) =>
                    String(e?.branchId ?? e?.branch_id ?? '') === toBranchId &&
                    String(e?.channel || '').toUpperCase() === String(channel || '').toUpperCase());
                const clone: any = { ...entry, branchId: toBranchId };
                if (idx >= 0) {
                    if (overwrite) { next[idx] = clone; changed = true; copiedEntries++; }
                    else skippedEntries++;
                } else {
                    next.push(clone); changed = true; copiedEntries++;
                }
            }
            if (changed) {
                await db.update(menuItems).set({ branchPricing: next, updatedAt: new Date() }).where(eq(menuItems.id, item.id));
                updatedItems++;
            }
        }
        const userId = (req as any).user?.id;
        await createSignedAuditLog({
            eventType: 'MENU_BRANCH_PRICING_COPIED',
            userId,
            branchId: toBranchId,
            payload: { fromBranchId, toBranchId, overwrite, updatedItems, copiedEntries, skippedEntries },
            reason: 'Branch price list copied',
            sourceDevice: req.headers['user-agent'] || 'unknown',
            requestId: req.headers['x-request-id'] as string || `req-${Date.now()}`,
        }).catch(() => undefined);
        dbCacheService.invalidatePattern('menu:');
        res.json({ updatedItems, copiedEntries, skippedEntries });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Get items pending approval or with pending price changes
 * GET /api/menu/items/pending
 */
export const getPendingItems = async (req: Request, res: Response) => {
    try {
        const pendingApproval = await db.select().from(menuItems)
            .where(eq(menuItems.status, 'pending_approval'));

        const pendingPriceChange = await db.select().from(menuItems)
            .where(and(
                eq(menuItems.status, 'published'),
                // Filter where pendingPrice is not null - using raw check
            ));

        // Filter in JS for pending price since Drizzle doesn't have isNotNull easily
        const withPendingPrice = pendingPriceChange.filter(item => item.pendingPrice !== null);

        res.json({
            pendingApproval,
            pendingPriceChange: withPendingPrice,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

// --- CSV Import/Export ---

type ImportRow = Record<string, any>;

type SmartImportRowDetail = {
    rowNumber: number;
    action: 'create' | 'update' | 'skip' | 'error' | 'attach';
    sheet?: string;
    name?: string;
    categoryName?: string;
    sku?: string;
    barcode?: string;
    itemId?: string;
    categoryId?: string;
    categoryCreated?: boolean;
    price?: number;
    message?: string;
};

type SmartImportResults = {
    created: number;
    updated: number;
    categoriesCreated: number;
    skipped: number;
    errors: string[];
    warnings: string[];
    details: SmartImportRowDetail[];
};

const normalizeText = (value: any) => String(value ?? '').trim();
const normalizeKey = (value: any) => normalizeText(value).toLowerCase().replace(/\s+/g, ' ');

const slugifyIdPart = (value: string) =>
    normalizeKey(value)
        .replace(/[^a-z0-9\u0600-\u06ff]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 42) || 'row';

const makeMenuId = (prefix: string, seed: string, index: number) =>
    `${prefix}-${slugifyIdPart(seed)}-${Date.now().toString(36)}-${index}`;

const toNumber = (value: any, fallback = 0) => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
    const cleaned = normalizeText(value)
        .replace(/[^\d.,-]/g, '')
        .replace(/,(?=\d{1,2}$)/, '.')
        .replace(/,/g, '');
    if (!cleaned) return fallback;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const toInteger = (value: any, fallback = 0) => {
    const parsed = Math.round(toNumber(value, fallback));
    return Number.isFinite(parsed) ? parsed : fallback;
};

const toBoolean = (value: any, fallback = true) => {
    const raw = normalizeKey(value);
    if (!raw) return fallback;
    if (['true', 'yes', 'y', '1', 'available', 'active', 'متاح', 'نعم', 'اه', 'أه'].includes(raw)) return true;
    if (['false', 'no', 'n', '0', 'unavailable', 'inactive', 'غير متاح', 'لا'].includes(raw)) return false;
    return fallback;
};

const getRowValue = (row: ImportRow, aliases: string[]) => {
    const aliasSet = new Set(aliases.map(normalizeKey));
    for (const [key, value] of Object.entries(row)) {
        if (aliasSet.has(normalizeKey(key))) return value;
    }
    return undefined;
};

const getRowString = (row: ImportRow, aliases: string[]) => normalizeText(getRowValue(row, aliases));

const parseImportRows = (rows: any): ImportRow[] => {
    if (!Array.isArray(rows)) return [];
    return rows
        .filter((row) => row && typeof row === 'object')
        .map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => normalizeText(key))));
};

const rowAliases = {
    id: ['id', 'item_id', 'item id', 'كود السيستم'],
    sku: ['sku', 'item_sku', 'item sku', 'كود', 'كود الصنف'],
    barcode: ['barcode', 'bar_code', 'bar code', 'باركود'],
    categoryId: ['categoryid', 'category_id', 'category id', 'section_id'],
    categoryName: ['category', 'categoryname', 'category_name', 'category name', 'section', 'section_name', 'القسم', 'اسم القسم'],
    categoryAr: ['category_ar', 'category ar', 'categoryarabic', 'category_arabic', 'اسم القسم عربي'],
    name: ['name', 'item_name', 'item name', 'product', 'product name', 'الصنف', 'اسم الصنف'],
    nameAr: ['namear', 'name_ar', 'item_name_ar', 'item ar', 'arabic name', 'اسم الصنف عربي'],
    description: ['description', 'desc', 'وصف'],
    descriptionAr: ['description_ar', 'description ar', 'وصف عربي'],
    price: ['price', 'sale_price', 'selling price', 'سعر', 'السعر'],
    status: ['status', 'الحالة'],
    isAvailable: ['available', 'isavailable', 'is_available', 'active', 'متاح'],
    preparationTime: ['preparationtime', 'preparation_time', 'prep_time', 'وقت التحضير'],
    isPopular: ['ispopular', 'is_popular', 'popular', 'شائع'],
    isFeatured: ['isfeatured', 'is_featured', 'featured', 'مميز'],
    sortOrder: ['sortorder', 'sort_order', 'order', 'ترتيب'],
    image: ['image', 'image_url', 'photo', 'صورة'],
    printerIds: ['printerids', 'printer_ids', 'printers', 'طابعات'],
};

const extensionAliases = {
    itemId: ['item_id', 'item id', 'id', 'menu_item_id'],
    sku: ['sku', 'item_sku', 'item sku'],
    barcode: ['barcode', 'bar_code', 'bar code'],
    itemName: ['item_name', 'item name', 'name', 'product', 'product name'],
    sizeName: ['size', 'size_name', 'size name', 'name', 'variant', 'variant name'],
    sizeNameAr: ['size_ar', 'size_name_ar', 'size arabic', 'name_ar'],
    groupName: ['group', 'group_name', 'modifier_group', 'modifier group'],
    groupNameAr: ['group_ar', 'group_name_ar', 'modifier_group_ar'],
    optionName: ['option', 'option_name', 'modifier_option', 'option name'],
    optionNameAr: ['option_ar', 'option_name_ar', 'modifier_option_ar'],
    minSelection: ['min', 'min_selection', 'minimum'],
    maxSelection: ['max', 'max_selection', 'maximum'],
    ingredientId: ['ingredient_id', 'inventory_item_id', 'inventory id'],
    ingredientName: ['ingredient', 'ingredient_name', 'inventory_item', 'inventory name'],
    sizeId: ['size_id', 'size id', 'variant_id', 'variant id'],
    quantity: ['qty', 'quantity'],
    unit: ['unit'],
    notes: ['notes', 'note'],
    yield: ['yield', 'servings'],
    instructions: ['instructions', 'method'],
};

const parseCsvRows = (csvData: string) => {
    const lines = csvData.split(/\r?\n/).filter((l: string) => l.trim());
    if (lines.length < 2) return [];
    const headers = parseCSVLine(lines[0]).map((h) => h.trim());
    return lines.slice(1).map((line) => {
        const values = parseCSVLine(line);
        const row: ImportRow = {};
        headers.forEach((header, index) => {
            row[header] = values[index];
        });
        return row;
    });
};

const splitList = (value: any) =>
    normalizeText(value)
        .split(/[|;,]/)
        .map((part) => part.trim())
        .filter(Boolean);

const mergeByName = <T extends { name: string }>(items: T[], next: T) => {
    const index = items.findIndex((item) => normalizeKey(item.name) === normalizeKey(next.name));
    if (index >= 0) {
        const merged = [...items];
        merged[index] = { ...merged[index], ...next };
        return merged;
    }
    return [...items, next];
};

const resolveItemRef = (row: ImportRow) => ({
    id: getRowString(row, extensionAliases.itemId),
    sku: getRowString(row, extensionAliases.sku),
    barcode: getRowString(row, extensionAliases.barcode),
    name: getRowString(row, extensionAliases.itemName),
});

const findExistingItemForExtension = async (row: ImportRow) => {
    const ref = resolveItemRef(row);
    if (ref.id) {
        const [existing] = await db.select().from(menuItems).where(eq(menuItems.id, ref.id));
        if (existing) return existing;
    }

    const lookupConditions: any[] = [];
    if (ref.sku) lookupConditions.push(eq(menuItems.sku, ref.sku));
    if (ref.barcode) lookupConditions.push(eq(menuItems.barcode, ref.barcode));
    if (lookupConditions.length > 0) {
        const [existing] = await db.select().from(menuItems).where(or(...lookupConditions));
        if (existing) return existing;
    }

    if (ref.name) {
        const [existing] = await db.select().from(menuItems).where(eq(menuItems.name, ref.name));
        if (existing) return existing;
    }

    return null;
};

const findExistingItem = async (candidate: {
    id?: string;
    sku?: string;
    barcode?: string;
    name: string;
    categoryId: string | null;
}) => {
    if (candidate.id) {
        const [existing] = await db.select().from(menuItems).where(eq(menuItems.id, candidate.id));
        if (existing) return existing;
    }

    const lookupConditions: any[] = [];
    if (candidate.sku) lookupConditions.push(eq(menuItems.sku, candidate.sku));
    if (candidate.barcode) lookupConditions.push(eq(menuItems.barcode, candidate.barcode));

    if (lookupConditions.length > 0) {
        const [existing] = await db.select().from(menuItems).where(or(...lookupConditions));
        if (existing) return existing;
    }

    const sameName = await db.select().from(menuItems).where(eq(menuItems.name, candidate.name));
    return sameName.find((item) => item.categoryId === candidate.categoryId) || null;
};

const importMenuRows = async (rows: ImportRow[], options: { updateExisting?: boolean; menuId?: string; dryRun?: boolean }) => {
    const menuId = options.menuId || 'menu-1';
    const results: SmartImportResults = {
        created: 0,
        updated: 0,
        categoriesCreated: 0,
        skipped: 0,
        errors: [],
        warnings: [],
        details: [],
    };

    const existingCategories = await readCategoriesCompat();
    const categoryById = new Map(existingCategories.map((category: any) => [String(category.id), category]));
    const categoryByName = new Map(existingCategories.map((category: any) => [normalizeKey(category.name), category]));
    existingCategories.forEach((category: any) => {
        if (category.nameAr) categoryByName.set(normalizeKey(category.nameAr), category);
    });

    for (let index = 0; index < rows.length; index++) {
        const rowNumber = index + 2;
        const row = rows[index];

        try {
            const name = getRowString(row, rowAliases.name);
            const priceRaw = getRowValue(row, rowAliases.price);
            const price = toNumber(priceRaw, Number.NaN);

            if (!name) {
                results.skipped++;
                const message = `Row ${rowNumber}: item name is required`;
                results.errors.push(message);
                results.details.push({ rowNumber, action: 'error', message });
                continue;
            }
            if (!Number.isFinite(price) || price < 0) {
                results.skipped++;
                const message = `Row ${rowNumber}: valid price is required`;
                results.errors.push(message);
                results.details.push({ rowNumber, action: 'error', name, price: Number.isFinite(price) ? price : undefined, message });
                continue;
            }

            const categoryIdFromRow = getRowString(row, rowAliases.categoryId);
            const categoryName = getRowString(row, rowAliases.categoryName) || 'General';
            const categoryAr = getRowString(row, rowAliases.categoryAr);

            let category: any = categoryIdFromRow ? categoryById.get(categoryIdFromRow) : undefined;
            if (!category) category = categoryByName.get(normalizeKey(categoryName));
            if (!category && categoryAr) category = categoryByName.get(normalizeKey(categoryAr));
            let categoryCreatedForRow = false;

            if (!category) {
                const newCategoryId = categoryIdFromRow || makeMenuId('cat', categoryName, index + 1);
                const newCategory = {
                    id: newCategoryId,
                    name: categoryName,
                    nameAr: categoryAr || null,
                    menuIds: [menuId],
                    isActive: true,
                    sortOrder: categoryById.size + 1,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };

                if (options.dryRun) {
                    category = newCategory;
                } else {
                    const [createdCategory] = await db.insert(menuCategories).output().values(newCategory as any);
                    category = createdCategory;
                }
                categoryById.set(category.id, category);
                categoryByName.set(normalizeKey(category.name), category);
                if (category.nameAr) categoryByName.set(normalizeKey(category.nameAr), category);
                results.categoriesCreated++;
                categoryCreatedForRow = true;
            }

            const id = getRowString(row, rowAliases.id);
            const sku = getRowString(row, rowAliases.sku);
            const barcode = getRowString(row, rowAliases.barcode);
            const existing = await findExistingItem({ id, sku, barcode, name, categoryId: category.id });
            const printerIds = splitList(getRowValue(row, rowAliases.printerIds));

            const itemData = {
                id: id || existing?.id || makeMenuId('item', sku || barcode || name, index + 1),
                categoryId: category.id,
                name,
                nameAr: getRowString(row, rowAliases.nameAr) || null,
                description: getRowString(row, rowAliases.description) || null,
                descriptionAr: getRowString(row, rowAliases.descriptionAr) || null,
                price,
                cost: Number(existing?.cost || 0),
                image: getRowString(row, rowAliases.image) || null,
                status: getRowString(row, rowAliases.status) || existing?.status || 'published',
                isAvailable: toBoolean(getRowValue(row, rowAliases.isAvailable), true),
                preparationTime: toInteger(getRowValue(row, rowAliases.preparationTime), 15),
                isPopular: toBoolean(getRowValue(row, rowAliases.isPopular), false),
                isFeatured: toBoolean(getRowValue(row, rowAliases.isFeatured), false),
                sortOrder: toInteger(getRowValue(row, rowAliases.sortOrder), index + 1),
                sku: sku || null,
                barcode: barcode || null,
                printerIds: printerIds.length > 0 ? printerIds : existing?.printerIds || [],
            };

            if (existing) {
                if (!options.updateExisting) {
                    results.skipped++;
                    const message = `Row ${rowNumber}: ${name} already exists`;
                    results.warnings.push(message);
                    results.details.push({
                        rowNumber,
                        action: 'skip',
                        name,
                        categoryName: category.name,
                        sku,
                        barcode,
                        itemId: existing.id,
                        categoryId: category.id,
                        categoryCreated: categoryCreatedForRow,
                        price,
                        message,
                    });
                    continue;
                }

                const { id: _id, ...updateData } = itemData;
                if (!options.dryRun) {
                    await db.update(menuItems)
                        .set({ ...updateData, updatedAt: new Date() } as any)
                        .where(eq(menuItems.id, existing.id));
                }
                results.updated++;
                results.details.push({
                    rowNumber,
                    action: 'update',
                    name,
                    categoryName: category.name,
                    sku,
                    barcode,
                    itemId: existing.id,
                    categoryId: category.id,
                    categoryCreated: categoryCreatedForRow,
                    price,
                });
            } else {
                if (!options.dryRun) {
                    await db.insert(menuItems).values({
                        ...itemData,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    } as any);
                }
                results.created++;
                results.details.push({
                    rowNumber,
                    action: 'create',
                    name,
                    categoryName: category.name,
                    sku,
                    barcode,
                    itemId: itemData.id,
                    categoryId: category.id,
                    categoryCreated: categoryCreatedForRow,
                    price,
                });
            }
        } catch (err: any) {
            results.skipped++;
            const message = `Row ${rowNumber}: ${err.message}`;
            results.errors.push(message);
            results.details.push({ rowNumber, action: 'error', message });
        }
    }

    return results;
};

const attachMenuExtensionRows = async (
    results: SmartImportResults,
    input: { sizesRows?: ImportRow[]; modifierRows?: ImportRow[]; recipeRows?: ImportRow[] },
    options: { dryRun?: boolean },
) => {
    for (let index = 0; index < (input.sizesRows || []).length; index++) {
        const rowNumber = index + 2;
        const row = input.sizesRows![index];
        const item = await findExistingItemForExtension(row);
        const sizeName = getRowString(row, extensionAliases.sizeName);

        if (!item || !sizeName) {
            const message = `Sizes row ${rowNumber}: item and size name are required`;
            results.skipped++;
            results.errors.push(message);
            results.details.push({ rowNumber, sheet: 'Sizes', action: 'error', name: sizeName, message });
            continue;
        }

        const nextSize = {
            id: getRowString(row, ['size_id', 'id']) || makeMenuId('size', `${item.id}-${sizeName}`, index + 1),
            name: sizeName,
            nameAr: getRowString(row, extensionAliases.sizeNameAr) || undefined,
            price: toNumber(getRowValue(row, rowAliases.price), Number(item.price || 0)),
            isAvailable: toBoolean(getRowValue(row, rowAliases.isAvailable), true),
        };
        const sizes = mergeByName(Array.isArray((item as any).sizes) ? (item as any).sizes : [], nextSize);

        if (!options.dryRun) {
            await db.update(menuItems).set({ sizes, updatedAt: new Date() } as any).where(eq(menuItems.id, item.id));
        }

        results.updated++;
        results.details.push({
            rowNumber,
            sheet: 'Sizes',
            action: 'attach',
            name: `${item.name} / ${sizeName}`,
            itemId: item.id,
            sku: item.sku || undefined,
            barcode: item.barcode || undefined,
            price: nextSize.price,
        });
    }

    for (let index = 0; index < (input.modifierRows || []).length; index++) {
        const rowNumber = index + 2;
        const row = input.modifierRows![index];
        const item = await findExistingItemForExtension(row);
        const groupName = getRowString(row, extensionAliases.groupName);
        const optionName = getRowString(row, extensionAliases.optionName);

        if (!item || !groupName || !optionName) {
            const message = `Modifiers row ${rowNumber}: item, group, and option are required`;
            results.skipped++;
            results.errors.push(message);
            results.details.push({ rowNumber, sheet: 'Modifiers', action: 'error', name: optionName || groupName, message });
            continue;
        }

        const groups = Array.isArray(item.modifierGroups) ? [...item.modifierGroups] : [];
        const groupIndex = groups.findIndex((group: any) => normalizeKey(group.name) === normalizeKey(groupName));
        const nextOption = {
            id: getRowString(row, ['option_id']) || makeMenuId('opt', `${item.id}-${groupName}-${optionName}`, index + 1),
            name: optionName,
            nameAr: getRowString(row, extensionAliases.optionNameAr) || undefined,
            price: toNumber(getRowValue(row, rowAliases.price), 0),
        };

        if (groupIndex >= 0) {
            groups[groupIndex] = {
                ...groups[groupIndex],
                minSelection: toInteger(getRowValue(row, extensionAliases.minSelection), groups[groupIndex].minSelection ?? 0),
                maxSelection: toInteger(getRowValue(row, extensionAliases.maxSelection), groups[groupIndex].maxSelection ?? 1),
                options: mergeByName(Array.isArray(groups[groupIndex].options) ? groups[groupIndex].options : [], nextOption),
            };
        } else {
            groups.push({
                id: getRowString(row, ['group_id']) || makeMenuId('mod', `${item.id}-${groupName}`, index + 1),
                name: groupName,
                nameAr: getRowString(row, extensionAliases.groupNameAr) || undefined,
                minSelection: toInteger(getRowValue(row, extensionAliases.minSelection), 0),
                maxSelection: toInteger(getRowValue(row, extensionAliases.maxSelection), 1),
                options: [nextOption],
            });
        }

        if (!options.dryRun) {
            await db.update(menuItems).set({ modifierGroups: groups, updatedAt: new Date() } as any).where(eq(menuItems.id, item.id));
        }

        results.updated++;
        results.details.push({
            rowNumber,
            sheet: 'Modifiers',
            action: 'attach',
            name: `${item.name} / ${groupName} / ${optionName}`,
            itemId: item.id,
            sku: item.sku || undefined,
            barcode: item.barcode || undefined,
            price: nextOption.price,
        });
    }

    for (let index = 0; index < (input.recipeRows || []).length; index++) {
        const rowNumber = index + 2;
        const row = input.recipeRows![index];
        const item = await findExistingItemForExtension(row);
        const ingredientId = getRowString(row, extensionAliases.ingredientId);
        const ingredientName = getRowString(row, extensionAliases.ingredientName);
        const quantity = toNumber(getRowValue(row, extensionAliases.quantity), Number.NaN);

        let ingredient: any = null;
        if (ingredientId) {
            [ingredient] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, ingredientId));
        }
        if (!ingredient && ingredientName) {
            [ingredient] = await db.select().from(inventoryItems).where(eq(inventoryItems.name, ingredientName));
        }

        if (!item || !ingredient || !Number.isFinite(quantity) || quantity <= 0) {
            const message = `Recipes row ${rowNumber}: item, ingredient, and positive quantity are required`;
            results.skipped++;
            results.errors.push(message);
            results.details.push({ rowNumber, sheet: 'Recipes', action: 'error', name: item?.name, message });
            continue;
        }

        if (!options.dryRun) {
            const requestedSizeId = getRowString(row, extensionAliases.sizeId);
            const requestedSizeName = getRowString(row, extensionAliases.sizeName);
            const itemSizes = Array.isArray((item as any).sizes) ? (item as any).sizes : [];
            const matchedSize = itemSizes.find((size: any) =>
                (requestedSizeId && String(size.id || '') === requestedSizeId) ||
                (requestedSizeName && normalizeKey(size.name) === normalizeKey(requestedSizeName))
            );
            const sizeId = requestedSizeId || matchedSize?.id || null;
            const recipeCondition = sizeId
                ? and(eq(recipes.menuItemId, item.id), eq(recipes.sizeId, sizeId))
                : and(eq(recipes.menuItemId, item.id), isNull(recipes.sizeId));
            let [recipe] = await db.select().from(recipes).where(recipeCondition);
            if (!recipe) {
                [recipe] = await db.insert(recipes).output().values({
                    id: makeMenuId('recipe', `${item.id}-${sizeId || 'base'}`, index + 1),
                    menuItemId: item.id,
                    sizeId,
                    yield: toNumber(getRowValue(row, extensionAliases.yield), 1),
                    instructions: getRowString(row, extensionAliases.instructions) || null,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                } as any);
            }

            const ingredientPayload = {
                quantity,
                unit: getRowString(row, extensionAliases.unit) || ingredient.unit || 'unit',
                notes: getRowString(row, extensionAliases.notes) || null,
                lastKnownCost: ingredient.costPrice || ingredient.purchasePrice || 0,
                lastCostUpdate: new Date(),
            };
            const [existingIngredient] = await db.select().from(recipeIngredients).where(and(
                eq(recipeIngredients.recipeId, recipe.id),
                eq(recipeIngredients.inventoryItemId, ingredient.id),
            ));
            if (existingIngredient) {
                await db.update(recipeIngredients).set(ingredientPayload as any)
                    .where(eq(recipeIngredients.id, existingIngredient.id));
            } else {
                await db.insert(recipeIngredients).values({
                    recipeId: recipe.id,
                    inventoryItemId: ingredient.id,
                    ...ingredientPayload,
                } as any);
            }
        }

        results.updated++;
        results.details.push({
            rowNumber,
            sheet: 'Recipes',
            action: 'attach',
            name: `${item.name}${getRowString(row, extensionAliases.sizeName) ? ` / ${getRowString(row, extensionAliases.sizeName)}` : ''} / ${ingredient.name}`,
            itemId: item.id,
            sku: item.sku || undefined,
            barcode: item.barcode || undefined,
            message: `${quantity} ${getRowString(row, extensionAliases.unit) || ingredient.unit || 'unit'}`,
        });
    }
};

/**
 * Export menu items as CSV
 * GET /api/menu/items/export
 */
export const exportItemsCSV = async (req: Request, res: Response) => {
    try {
        const items = await db.select().from(menuItems).orderBy(menuItems.sortOrder);
        const categories = await db.select().from(menuCategories);

        const categoryMap = new Map(categories.map(c => [c.id, c.name]));

        // CSV Header
        const headers = [
            'id', 'name', 'nameAr', 'categoryId', 'categoryName',
            'price', 'description', 'status', 'isAvailable',
            'preparationTime', 'isPopular', 'isFeatured', 'sortOrder'
        ];

        const csvLines = [headers.join(',')];

        for (const item of items) {
            const row = [
                item.id,
                `"${(item.name || '').replace(/"/g, '""')}"`,
                `"${(item.nameAr || '').replace(/"/g, '""')}"`,
                item.categoryId || '',
                `"${categoryMap.get(item.categoryId || '') || ''}"`,
                item.price,
                `"${(item.description || '').replace(/"/g, '""')}"`,
                item.status || 'published',
                item.isAvailable ? 'true' : 'false',
                item.preparationTime || 15,
                item.isPopular ? 'true' : 'false',
                item.isFeatured ? 'true' : 'false',
                item.sortOrder || 0,
            ];
            csvLines.push(row.join(','));
        }

        const csv = csvLines.join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=menu_items.csv');
        res.send(csv);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Import menu items from CSV
 * POST /api/menu/items/import
 */
export const importItemsCSV = async (req: Request, res: Response) => {
    try {
        const {
            csvData,
            rows,
            sizesRows,
            modifierRows,
            recipeRows,
            updateExisting = false,
            menuId = 'menu-1',
            dryRun = false,
        } = req.body;

        const importRows = parseImportRows(rows);
        if (importRows.length > 0) {
            const results = await importMenuRows(importRows, { updateExisting, menuId, dryRun });
            await attachMenuExtensionRows(results, {
                sizesRows: parseImportRows(sizesRows),
                modifierRows: parseImportRows(modifierRows),
                recipeRows: parseImportRows(recipeRows),
            }, { dryRun });
            if (!dryRun) dbCacheService.invalidatePattern('menu:');
            return res.json(results);
        }

        if (!csvData) {
            return res.status(400).json({ error: 'IMPORT_DATA_REQUIRED' });
        }

        const csvRows = parseCsvRows(csvData);
        if (csvRows.length === 0) {
            return res.status(400).json({ error: 'INVALID_CSV_FORMAT' });
        }
        const results = await importMenuRows(csvRows, { updateExisting, menuId, dryRun });
        await attachMenuExtensionRows(results, {
            sizesRows: parseImportRows(sizesRows),
            modifierRows: parseImportRows(modifierRows),
            recipeRows: parseImportRows(recipeRows),
        }, { dryRun });

        if (!dryRun) dbCacheService.invalidatePattern('menu:');
        res.json(results);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

// Simple CSV line parser
function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);

    return result;
}
