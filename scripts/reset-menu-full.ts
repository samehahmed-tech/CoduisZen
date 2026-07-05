import { db } from '../server/db';
import {
    menuCategories,
    menuItems,
    recipes,
    menuItemModifiers,
    orderItems,
    orderStatusHistory,
    orders,
    payments,
    fiscalLogs,
    managerApprovals,
    recipeVersions,
    recipeIngredients,
    purchaseOrderItems,
    purchaseOrders
} from '../src/db/schema';
import * as fs from 'fs';

// This script reads the data from the user's provided path and imports it into the database.
const DATA_FILE_PATH = 'c:/Users/S A M E H/Downloads/delavega-3d-menu (2)/data.ts';

async function resetAndImport() {
    console.log('🚀 Starting Full Menu Reset and Import...');

    try {
        // 1. CLEAR EXISTING DATA (In order of dependency)
        console.log('🗑️ Clearing existing dependent transactions...');

        await db.delete(payments);
        await db.delete(fiscalLogs);
        await db.delete(managerApprovals);
        await db.delete(orderStatusHistory);
        await db.delete(orderItems);
        await db.delete(orders);

        console.log('🗑️ Clearing menu related data...');
        await db.delete(menuItemModifiers);
        await db.delete(recipeVersions);
        await db.delete(recipeIngredients);
        await db.delete(recipes);

        await db.delete(purchaseOrderItems);
        await db.delete(purchaseOrders);

        await db.delete(menuItems);
        await db.delete(menuCategories);

        console.log('✅ All menu-linked tables cleared.');

        // 2. PARSE THE DATA FILE
        console.log(`📖 Reading data from ${DATA_FILE_PATH}...`);
        const content = fs.readFileSync(DATA_FILE_PATH, 'utf-8');

        // Clean content for evaluation
        const cleanContent = content
            .replace(/import\s+.*\s+from\s+.*;/g, '')
            .replace(/:\s*MenuCategory\[\]/g, '')
            .replace(/export const MENU_DATA =/g, 'global.MENU_DATA =');

        try {
            eval(cleanContent);
        } catch (evalError) {
            console.error('Failed to parse data.ts. Context:', cleanContent.substring(0, 500));
            throw evalError;
        }

        const menuData = (global as any).MENU_DATA;

        if (!menuData || !Array.isArray(menuData)) {
            throw new Error('Could not find MENU_DATA array in the file.');
        }

        console.log(`📦 Found ${menuData.length} categories. Starting import...`);

        // 3. IMPORT DATA
        let categoryCount = 0;
        let itemCount = 0;

        for (const cat of menuData) {
            const categoryId = cat.id || `cat-${Date.now()}-${categoryCount}`;

            console.log(`   ➕ Category [${categoryCount + 1}/${menuData.length}]: ${cat.titleEn || cat.titleAr}`);

            await db.insert(menuCategories).values({
                id: categoryId,
                name: cat.titleEn || 'Unnamed Category',
                nameAr: cat.titleAr || null,
                icon: cat.icon || 'Grid',
                image: cat.coverImage || null,
                sortOrder: categoryCount * 10,
                isActive: true,
                menuIds: ['menu-1'],
                targetOrderTypes: ['DINE_IN', 'TAKEAWAY', 'DELIVERY']
            });
            categoryCount++;

            if (cat.items && Array.isArray(cat.items)) {
                for (const item of cat.items) {
                    await db.insert(menuItems).values({
                        id: item.id || `item-${Date.now()}-${itemCount}`,
                        categoryId: categoryId,
                        name: item.nameEn || 'Unnamed Item',
                        nameAr: item.nameAr || null,
                        description: item.descriptionEn || null,
                        descriptionAr: item.descriptionAr || null,
                        price: item.price || 0,
                        isAvailable: true,
                        status: 'published',
                        sortOrder: itemCount * 5,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    });
                    itemCount++;
                }
            }
        }

        console.log(`\n✨ IMPORT COMPLETE! ✨`);
        console.log(`📊 Categories imported: ${categoryCount}`);
        console.log(`📊 Items imported: ${itemCount}`);

        process.exit(0);
    } catch (error) {
        console.error('❌ Critical Error during reset:', error);
        process.exit(1);
    }
}

resetAndImport();
