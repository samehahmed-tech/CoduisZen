import { describe, expect, it } from 'vitest';
import { calculateModifierRecipeCost, calculateRecipeCost } from '../utils/menuCost';

describe('menu costing', () => {
    const costs = new Map([['flour', 10], ['cheese', 20]]);

    it('uses size recipe instead of base recipe', () => {
        const recipe = [
            { sizeId: null, ingredients: [{ itemId: 'flour', quantity: 1 }] },
            { sizeId: 'large', ingredients: [{ itemId: 'flour', quantity: 2 }] },
        ];
        expect(calculateRecipeCost(recipe, costs, 'large')).toBe(20);
    });

    it('calculates modifier recipe effect', () => {
        expect(calculateModifierRecipeCost({ recipeEffect: 'ADD', recipe: [{ itemId: 'cheese', quantity: 0.5 }] }, costs)).toBe(10);
        expect(calculateModifierRecipeCost({ recipeEffect: 'REMOVE', recipe: [{ itemId: 'cheese', quantity: 0.5 }] }, costs)).toBe(-10);
    });
});
