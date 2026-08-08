import { describe, expect, it } from 'vitest';
import { answerSystemCopilot, answerSystemCopilotFallback, normalizeCopilotText, similarity } from '../server/services/systemCopilotService';

describe('system copilot', () => {
  it('answers reports without an external model', () => {
    const context = {
      orders: [{ total: 100, status: 'COMPLETED' }, { total: 50, status: 'PENDING' }],
      inventory: [{ name: 'Cheese', quantity: 1, threshold: 2 }],
      menuItems: [{ id: 'item-1', name: 'Margherita' }],
      categories: [{ id: 'cat-1', name: 'Pizza' }],
    };
    expect(answerSystemCopilot('sales summary', 'en', context)?.text).toContain('150.00');
    expect(answerSystemCopilot('low stock', 'en', context)?.text).toContain('Cheese');
    expect(answerSystemCopilot('branch summary', 'en', context)?.suggestion?.view).toBe('REPORTS');
  });

  it('routes system guidance', () => {
    expect(answerSystemCopilot('open inventory', 'en', {})?.suggestion?.view).toBe('INVENTORY');
    expect(answerSystemCopilot('how do I create a batch?', 'en', {})?.suggestion?.view).toBe('RECIPES');
    expect(answerSystemCopilotFallback('en').actions).toEqual([]);
  });

  it('prepares guarded menu actions', () => {
    const context = { categories: [{ id: 'cat-1', name: 'Pizza' }], menuItems: [{ id: 'item-1', name: 'Margherita' }] };
    expect(answerSystemCopilot('add category Drinks', 'en', context)?.actions[0]).toMatchObject({ type: 'CREATE_MENU_CATEGORY' });
    expect(answerSystemCopilot('delete item Margherita', 'en', context)?.actions[0]).toMatchObject({ type: 'DELETE_MENU_ITEM', itemId: 'item-1' });
    expect(answerSystemCopilot('change price item Margherita to 120', 'en', context)?.actions[0]).toMatchObject({ type: 'UPDATE_MENU_PRICE', itemId: 'item-1', price: 120 });
  });

  it('understands Egyptian Arabic, spelling variants, and relative dates', () => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const context = {
      orders: [
        { total: 90, status: 'COMPLETED', createdAt: yesterday, items: [{ id: 'm1', nameAr: 'بيتزا', quantity: 2, price: 45 }] },
        { total: 40, status: 'COMPLETED', createdAt: now },
      ],
    };
    const answer = answerSystemCopilot('عايز مبيعت امبارح والاكتر بيعا', 'ar', context)?.text || '';
    expect(answer).toContain('90.00');
    expect(answer).toContain('بيتزا');
    expect(normalizeCopilotText('إعــدادات')).toBe('اعدادات');
    expect(similarity('مبيعت', 'مبيعات')).toBeGreaterThan(0.6);
  });

  it('uses recent conversation to finish a task', () => {
    const context = {
      categories: [{ id: 'cat-1', nameAr: 'بيتزا', name: 'Pizza' }],
      history: [
        { sender: 'user', text: 'ضيف صنف جديد' },
        { sender: 'ai', text: 'حدد اسم الصنف والسعر والمجموعة.' },
      ],
    };
    expect(answerSystemCopilot('مارجريتا سعر 120 في مجموعة بيتزا', 'ar', context)?.actions[0]).toMatchObject({
      type: 'CREATE_MENU_ITEM',
      categoryId: 'cat-1',
      data: { price: 120 },
    });
  });

  it('prepares customers and diagnoses operational problems', () => {
    expect(answerSystemCopilot('ضيف عميل أحمد 01012345678', 'ar', {})?.actions[0]).toMatchObject({
      type: 'CREATE_CUSTOMER',
      data: { name: 'أحمد', phone: '01012345678' },
    });
    expect(answerSystemCopilot('عندي مشكلة الطلب مش بيروح للمطبخ', 'ar', { orders: [] })?.suggestion?.view).toBe('KDS');
  });
});
