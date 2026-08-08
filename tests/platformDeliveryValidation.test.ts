import { describe, expect, it } from 'vitest';
import { isPlatformDeliveryValid } from '../src/features/pos/platformDeliveryValidation';

const validDraft = {
  customerName: 'Ahmed Ali',
  customerPhone: '+20 100 123 4567',
  address: '12 Main Street',
};

describe('platform delivery validation', () => {
  it('accepts complete operational customer data', () => {
    expect(isPlatformDeliveryValid('T-123', validDraft)).toBe(true);
    expect(isPlatformDeliveryValid('T-124', {
      ...validDraft,
      customerPhone: '٠١٠٠١٢٣٤٥٦٧',
    })).toBe(true);
  });

  it.each([
    ['', validDraft],
    ['T-123', { ...validDraft, customerName: ' ' }],
    ['T-123', { ...validDraft, customerPhone: '123' }],
    ['T-123', { ...validDraft, address: '12' }],
  ])('rejects incomplete platform orders', (orderNumber, draft) => {
    expect(isPlatformDeliveryValid(orderNumber, draft)).toBe(false);
  });
});
