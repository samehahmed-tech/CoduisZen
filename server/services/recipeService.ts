/**
 * Recipe Service - Version Management and Cost Calculation
 */

import { db } from '../db';
import { recipes, recipeVersions, recipeIngredients, inventoryItems, menuItems } from '../../src/db/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export const recipeService = {
    /**
     * Create a new version of a recipe
     * Snapshots current ingredients and costs
     */
    async createVersion(recipeId: string, userId?: string, changeReason?: string) {
        const [recipe] = await db.select().from(recipes).where(eq(recipes.id, recipeId));
        if (!recipe) throw new Error('Recipe not found');

        // Get current ingredients with costs
        const ingredients = await db.select({
            id: recipeIngredients.id,
            inventoryItemId: recipeIngredients.inventoryItemId,
            quantity: recipeIngredients.quantity,
            unit: recipeIngredients.unit,
            itemName: inventoryItems.name,
            cost: inventoryItems.costPrice,
        })
            .from(recipeIngredients)
            .leftJoin(inventoryItems, eq(recipeIngredients.inventoryItemId, inventoryItems.id))
            .where(eq(recipeIngredients.recipeId, recipeId));

        // Calculate total cost
        const calculatedCost = ingredients.reduce((sum, ing) => {
            return sum + ((ing.cost || 0) * (ing.quantity || 0));
        }, 0);

        // Create snapshot
        const ingredientsSnapshot = ingredients.map(ing => ({
            inventoryItemId: ing.inventoryItemId,
            itemName: ing.itemName || '',
            quantity: ing.quantity || 0,
            unit: ing.unit || '',
            costPerUnit: ing.cost || 0,
        }));

        const newVersion = (recipe.version || 0) + 1;
        const versionId = nanoid();

        // Insert version record
        await db.insert(recipeVersions).values({
            id: versionId,
            recipeId,
            version: newVersion,
            yield: recipe.yield,
            instructions: recipe.instructions,
            ingredientsSnapshot,
            calculatedCost,
            changedBy: userId,
            changeReason,
            createdAt: new Date(),
        });

        // Update recipe to point to new version
        await db.update(recipes)
            .set({
                version: newVersion,
                currentVersionId: versionId,
                calculatedCost,
                lastCostCalculation: new Date(),
                updatedAt: new Date(),
            })
            .where(eq(recipes.id, recipeId));

        return { versionId, version: newVersion, calculatedCost };
    },

    /**
     * Recalculate cost for a recipe based on current ingredient prices
     */
    async recalculateCost(recipeId: string) {
        const ingredients = await db.select({
            ingredientId: recipeIngredients.id,
            quantity: recipeIngredients.quantity,
            cost: inventoryItems.costPrice,
        })
            .from(recipeIngredients)
            .leftJoin(inventoryItems, eq(recipeIngredients.inventoryItemId, inventoryItems.id))
            .where(eq(recipeIngredients.recipeId, recipeId));

        const calculatedCost = ingredients.reduce((sum, ing) => {
            return sum + ((ing.cost || 0) * (ing.quantity || 0));
        }, 0);

        // Update ingredient costs
        for (const ing of ingredients) {
            await db.update(recipeIngredients)
                .set({
                    lastKnownCost: ing.cost,
                    lastCostUpdate: new Date(),
                })
                .where(eq(recipeIngredients.id, ing.ingredientId));
        }

        // Update recipe cost
        await db.update(recipes)
            .set({
                calculatedCost,
                lastCostCalculation: new Date(),
                updatedAt: new Date(),
            })
            .where(eq(recipes.id, recipeId));

        // Update linked menu item cost if exists
        const [recipe] = await db.select().from(recipes).where(eq(recipes.id, recipeId));
        if (recipe?.menuItemId) {
            await db.update(menuItems)
                .set({
                    cost: calculatedCost,
                    updatedAt: new Date(),
                })
                .where(eq(menuItems.id, recipe.menuItemId));
        }

        return { recipeId, calculatedCost };
    },

    /**
     * Recalculate costs for all recipes that use a specific inventory item
     * Called when an inventory item's cost changes
     */
    async recalculateByIngredient(inventoryItemId: string) {
        const affectedIngredients = await db.select()
            .from(recipeIngredients)
            .where(eq(recipeIngredients.inventoryItemId, inventoryItemId));

        const recipeIds = [...new Set(affectedIngredients.map(i => i.recipeId))];
        const results: { recipeId: string; calculatedCost: number }[] = [];

        for (const recipeId of recipeIds) {
            const result = await this.recalculateCost(recipeId);
            results.push(result);
        }

        return { updated: results.length, results };
    },

    /**
     * Get version history for a recipe
     */
    async getVersionHistory(recipeId: string) {
        return db.select()
            .from(recipeVersions)
            .where(eq(recipeVersions.recipeId, recipeId))
            .orderBy(recipeVersions.version);
    },

    /**
     * Restore a recipe to a previous version
     */
    async restoreVersion(recipeId: string, versionId: string, userId?: string) {
        const [version] = await db.select()
            .from(recipeVersions)
            .where(eq(recipeVersions.id, versionId));

        if (!version) throw new Error('Version not found');
        if (version.recipeId !== recipeId) throw new Error('Version does not belong to this recipe');

        // Create a new version with restored data
        const result = await this.createVersion(recipeId, userId, `Restored from version ${version.version}`);

        // Update recipe with restored data
        await db.update(recipes)
            .set({
                yield: version.yield,
                instructions: version.instructions,
                updatedAt: new Date(),
            })
            .where(eq(recipes.id, recipeId));

        return result;
    },

    /**
     * Validate Bill of Materials (BOM) for a recipe
     * Checks for: missing inventory items, invalid units, negative costs, zero quantities
     */
    async validateBOM(recipeId: string) {
        const ingredients = await db.select({
            id: recipeIngredients.id,
            inventoryItemId: recipeIngredients.inventoryItemId,
            quantity: recipeIngredients.quantity,
            unit: recipeIngredients.unit,
            itemName: inventoryItems.name,
            cost: inventoryItems.costPrice,
            inventoryItemUnit: inventoryItems.unit,
        })
            .from(recipeIngredients)
            .leftJoin(inventoryItems, eq(recipeIngredients.inventoryItemId, inventoryItems.id))
            .where(eq(recipeIngredients.recipeId, recipeId));

        const errors: string[] = [];
        const warnings: string[] = [];

        for (const ing of ingredients) {
            if (!ing.inventoryItemId) {
                errors.push(`Ingredient ${ing.id} is missing inventory item reference`);
                continue;
            }
            if (!ing.itemName) {
                errors.push(`Inventory item ${ing.inventoryItemId} not found for ingredient ${ing.id}`);
                continue;
            }
            if (!ing.quantity || ing.quantity <= 0) {
                errors.push(`Invalid quantity ${ing.quantity} for item ${ing.itemName}`);
            }
            if (ing.cost !== null && (ing.cost as number) < 0) {
                errors.push(`Negative cost ${ing.cost} for item ${ing.itemName}`);
            }
            if (ing.cost === null || ing.cost === 0) {
                warnings.push(`Item ${ing.itemName} has zero or null cost`);
            }
            if (ing.unit !== ing.inventoryItemUnit) {
                warnings.push(`Unit mismatch for ${ing.itemName}: ingredient uses ${ing.unit}, inventory uses ${ing.inventoryItemUnit}`);
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings,
            itemCount: ingredients.length,
        };
    },
};

export default recipeService;
