import { describe, expect, it } from 'vitest';
import { createMenuItemSchema } from '../server/middleware/validation';

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
});
