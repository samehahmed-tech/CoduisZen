import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { guardAction } from '../src/services/aiActionGuard';

describe('aiActionGuard', () => {
    it('blocks inventory update when item is missing', () => {
        const guarded = guardAction({ type: 'UPDATE_INVENTORY', itemId: 'x', data: { threshold: 5 } }, {
            inventory: [],
            menuItems: [],
            categories: [],
        });
        expect(guarded.canExecute).toBe(false);
        expect(guarded.reason).toBe('Item not found');
    });

    it('creates preview for menu price update', () => {
        const guarded = guardAction({ type: 'UPDATE_MENU_PRICE', itemId: 'm1', price: 50 }, {
            inventory: [],
            menuItems: [{ id: 'm1', name: 'Item', price: 20 }],
            categories: [],
        });
        expect(guarded.canExecute).toBe(true);
        expect(guarded.before.price).toBe(20);
        expect(guarded.after.price).toBe(50);
    });

    it('keeps AI assistant action flow backend-driven', () => {
        const assistantPath = path.resolve(process.cwd(), 'components', 'AIAssistant.tsx');
        const source = fs.readFileSync(assistantPath, 'utf8');

        expect(source.includes('aiApi.chat(')).toBe(true);
        expect(source.includes('aiApi.previewAction(')).toBe(true);
        expect(source.includes('aiApi.actionExecute(')).toBe(true);
        expect(source.includes('guardAction(')).toBe(false);
    });
});
