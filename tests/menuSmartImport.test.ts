import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { inventoryItems, menuCategories, menuItems, recipeIngredients, recipes } from '../src/db/schema';
import { importItemsCSV } from '../server/controllers/menuController';

let db: typeof import('../server/db')['db'];

const makeResponse = () => {
    const response: any = {
        statusCode: 200,
        body: undefined,
        status(code: number) {
            this.statusCode = code;
            return this;
        },
        json(payload: any) {
            this.body = payload;
            return this;
        },
    };

    return response;
};

const runImport = async (body: Record<string, any>) => {
    const req = { body } as any;
    const res = makeResponse();
    await importItemsCSV(req, res);
    return res;
};

describe('smart menu import', () => {
    beforeEach(async () => {
        if (!db) {
            const dbModule = await import('../server/db');
            db = dbModule.db;
        }
    });

    it('creates missing categories and menu items from flexible Excel-style rows', async () => {
        const res = await runImport({
            menuId: 'test-menu-smart-import',
            rows: [
                {
                    Category: 'Test Burgers',
                    Category_AR: 'برجر اختبار',
                    SKU: 'TST-BURGER-001',
                    Barcode: '622000000001',
                    Item_Name: 'Classic Test Burger',
                    Item_Name_AR: 'برجر اختبار كلاسيك',
                    Price: 125,
                    Cost: 70,
                    Available: 'yes',
                    Preparation_Time: 12,
                    Printer_IDs: 'kitchen, cashier',
                },
            ],
        });

        expect(res.statusCode).toBe(200);
        expect(res.body).toMatchObject({
            created: 1,
            updated: 0,
            categoriesCreated: 1,
            skipped: 0,
        });
        expect(res.body.details).toEqual([
            expect.objectContaining({
                rowNumber: 2,
                action: 'create',
                name: 'Classic Test Burger',
                categoryName: 'Test Burgers',
                sku: 'TST-BURGER-001',
                barcode: '622000000001',
                categoryCreated: true,
                price: 125,
            }),
        ]);

        const [category] = await db.select().from(menuCategories).where(eq(menuCategories.name, 'Test Burgers'));
        expect(category).toBeTruthy();
        expect(category?.nameAr).toBe('برجر اختبار');

        const [item] = await db.select().from(menuItems).where(eq(menuItems.sku, 'TST-BURGER-001'));
        expect(item).toBeTruthy();
        expect(item?.categoryId).toBe(category?.id);
        expect(item?.barcode).toBe('622000000001');
        expect(Number(item?.price)).toBe(125);
        expect(item?.printerIds).toEqual(['kitchen', 'cashier']);
    });

    it('updates existing items by SKU when updateExisting is enabled', async () => {
        await db.insert(menuCategories).values({
            id: 'test-menu-import-category-existing',
            name: 'Test Existing Category',
            isActive: true,
        });
        await db.insert(menuItems).values({
            id: 'test-menu-import-item-existing',
            categoryId: 'test-menu-import-category-existing',
            name: 'Old Imported Item',
            price: 50,
            sku: 'TST-UPDATE-001',
            isAvailable: true,
        });

        const res = await runImport({
            updateExisting: true,
            rows: [
                {
                    Category: 'Test Existing Category',
                    SKU: 'TST-UPDATE-001',
                    Item_Name: 'Updated Imported Item',
                    Price: 75,
                    Available: 'no',
                },
            ],
        });

        expect(res.statusCode).toBe(200);
        expect(res.body).toMatchObject({
            created: 0,
            updated: 1,
            skipped: 0,
        });
        expect(res.body.details).toEqual([
            expect.objectContaining({
                rowNumber: 2,
                action: 'update',
                name: 'Updated Imported Item',
                sku: 'TST-UPDATE-001',
                itemId: 'test-menu-import-item-existing',
                price: 75,
            }),
        ]);

        const [item] = await db.select().from(menuItems).where(eq(menuItems.id, 'test-menu-import-item-existing'));
        expect(item?.name).toBe('Updated Imported Item');
        expect(Number(item?.price)).toBe(75);
        expect(item?.isAvailable).toBe(false);
    });

    it('reports row-level validation errors without aborting the import', async () => {
        const res = await runImport({
            rows: [
                { Category: 'Test Invalid Rows', Item_Name: '', Price: 20 },
                { Category: 'Test Invalid Rows', Item_Name: 'No Price Item', Price: '' },
                { Category: 'Test Invalid Rows', Item_Name: 'Valid Item', Price: 30 },
            ],
        });

        expect(res.statusCode).toBe(200);
        expect(res.body.created).toBe(1);
        expect(res.body.skipped).toBe(2);
        expect(res.body.errors).toEqual([
            expect.stringContaining('item name is required'),
            expect.stringContaining('valid price is required'),
        ]);
        expect(res.body.details.map((detail: any) => detail.action)).toEqual(['error', 'error', 'create']);
    });

    it('previews an import in dry-run mode without writing categories or items', async () => {
        const res = await runImport({
            dryRun: true,
            rows: [
                {
                    Category: 'Test Dry Run Category',
                    SKU: 'TST-DRY-RUN-001',
                    Item_Name: 'Dry Run Item',
                    Price: 42,
                },
            ],
        });

        expect(res.statusCode).toBe(200);
        expect(res.body).toMatchObject({
            created: 1,
            categoriesCreated: 1,
            skipped: 0,
        });
        expect(res.body.details).toEqual([
            expect.objectContaining({
                rowNumber: 2,
                action: 'create',
                name: 'Dry Run Item',
                categoryName: 'Test Dry Run Category',
                categoryCreated: true,
            }),
        ]);

        const [category] = await db.select().from(menuCategories).where(eq(menuCategories.name, 'Test Dry Run Category'));
        const [item] = await db.select().from(menuItems).where(eq(menuItems.sku, 'TST-DRY-RUN-001'));
        expect(category).toBeUndefined();
        expect(item).toBeUndefined();
    });

    it('attaches sizes, modifiers, and recipe ingredients from extra workbook sheets', async () => {
        await db.insert(inventoryItems).values({
            id: 'test-menu-import-cheese',
            name: 'Test Cheese',
            unit: 'g',
            costPrice: 0.25,
            isActive: true,
        }).onConflictDoNothing();

        const res = await runImport({
            rows: [
                {
                    Category: 'Test Combos',
                    SKU: 'TST-COMBO-001',
                    Item_Name: 'Combo Meal',
                    Price: 100,
                },
            ],
            sizesRows: [
                {
                    SKU: 'TST-COMBO-001',
                    Size_Name: 'Large',
                    Price: 130,
                    Cost: 80,
                    Available: 'yes',
                },
            ],
            modifierRows: [
                {
                    SKU: 'TST-COMBO-001',
                    Group_Name: 'Extras',
                    Min_Selection: 0,
                    Max_Selection: 3,
                    Option_Name: 'Extra Cheese',
                    Price: 15,
                },
            ],
            recipeRows: [
                {
                    SKU: 'TST-COMBO-001',
                    Ingredient_ID: 'test-menu-import-cheese',
                    Quantity: 30,
                    Unit: 'g',
                    Yield: 1,
                },
            ],
        });

        expect(res.statusCode).toBe(200);
        expect(res.body.details.map((detail: any) => detail.sheet || 'Items')).toEqual([
            'Items',
            'Sizes',
            'Modifiers',
            'Recipes',
        ]);

        const [item] = await db.select().from(menuItems).where(eq(menuItems.sku, 'TST-COMBO-001'));
        expect(item?.sizes).toEqual([
            expect.objectContaining({ name: 'Large', price: 130, cost: 80, isAvailable: true }),
        ]);
        expect(item?.modifierGroups).toEqual([
            expect.objectContaining({
                name: 'Extras',
                maxSelection: 3,
                options: [expect.objectContaining({ name: 'Extra Cheese', price: 15 })],
            }),
        ]);

        const [recipe] = await db.select().from(recipes).where(eq(recipes.menuItemId, item.id));
        expect(recipe).toBeTruthy();
        const [ingredient] = await db.select().from(recipeIngredients).where(eq(recipeIngredients.recipeId, recipe.id));
        expect(ingredient?.inventoryItemId).toBe('test-menu-import-cheese');
        expect(Number(ingredient?.quantity)).toBe(30);
    });
});
