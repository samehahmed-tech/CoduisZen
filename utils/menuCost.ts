export type CostLookup = Map<string, number> | Record<string, number>;

const lookupCost = (lookup: CostLookup, itemId: string) => {
    const value = lookup instanceof Map ? lookup.get(itemId) : lookup[itemId];
    return Number.isFinite(Number(value)) ? Number(value) : 0;
};

export const getRecipeIngredients = (recipe: unknown, sizeId?: string | null): any[] => {
    if (!Array.isArray(recipe) || recipe.length === 0) return [];
    if (!recipe.some((entry: any) => Array.isArray(entry?.ingredients))) return recipe;

    const exact = recipe.find((entry: any) => entry?.sizeId === sizeId);
    if (exact) return Array.isArray(exact.ingredients) ? exact.ingredients : [];
    const base = recipe.find((entry: any) => !entry?.sizeId);
    return Array.isArray(base?.ingredients) ? base.ingredients : [];
};

export const calculateRecipeCost = (recipe: unknown, costs: CostLookup, sizeId?: string | null) =>
    getRecipeIngredients(recipe, sizeId).reduce((total, ingredient: any) => {
        const itemId = ingredient?.itemId || ingredient?.inventoryItemId;
        return total + (itemId ? lookupCost(costs, itemId) * Number(ingredient?.quantity || 0) : 0);
    }, 0);

export const calculateModifierRecipeCost = (option: any, costs: CostLookup, sizeId?: string | null) => {
    const recipe = option?.recipeBySize?.[sizeId || ''] || option?.recipe || [];
    const cost = calculateRecipeCost(recipe, costs);
    return option?.recipeEffect === 'REMOVE' ? -cost : cost;
};
