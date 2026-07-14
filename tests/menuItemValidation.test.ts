import { describe, expect, it } from 'vitest';
import { createMenuItemSchema, updateMenuItemSchema } from '../server/middleware/validation';

const baseItem = {
    id: 'test-item-1',
    categoryId: 'test-category-1',
    name: 'Test Item',
    price: 99,
};

describe('menu item validation', () => {
    it('accepts compressed data URL fallback images from local uploads', () => {
        const image = `data:image/webp;base64,${'a'.repeat(40_000)}`;

        const parsed = createMenuItemSchema.parse({
            ...baseItem,
            image,
        });

        expect(parsed.image).toBe(image);
    });

    it('still rejects unreasonably large image payloads', () => {
        const image = `data:image/webp;base64,${'a'.repeat(2 * 1024 * 1024)}`;

        expect(() => createMenuItemSchema.parse({
            ...baseItem,
            image,
        })).toThrow(/Image reference is too large/);
    });

    it('strips UI-only fields before updating the SQL row', () => {
        const parsed = updateMenuItemSchema.parse({
            name: 'Updated Item',
            price: 120,
            priceLists: [{ id: 'retail', price: 120 }],
            category_id: 'category-2',
            name_ar: 'صنف معدل',
        });

        expect(parsed).toMatchObject({
            name: 'Updated Item',
            price: 120,
            categoryId: 'category-2',
            nameAr: 'صنف معدل',
        });
        expect(parsed).not.toHaveProperty('priceLists');
        expect(parsed).not.toHaveProperty('category_id');
        expect(parsed).not.toHaveProperty('name_ar');
    });

    it('accepts the archived status used by the delete fallback', () => {
        expect(updateMenuItemSchema.parse({ status: 'archived' }).status).toBe('archived');
    });
});
