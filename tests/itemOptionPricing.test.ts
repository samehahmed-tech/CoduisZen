import { describe, expect, it } from 'vitest';
import { resolveItemOptionPrice } from '../src/features/pos/itemOptionPricing';

describe('item option pricing', () => {
  it('keeps an explicit open price when a size is selected', () => {
    expect(resolveItemOptionPrice({
      itemPrice: 0,
      isOpenPrice: true,
      customPrice: 75,
      selectedSizePrice: 120,
    })).toBe(75);
  });

  it('uses the selected size for fixed-price items', () => {
    expect(resolveItemOptionPrice({
      itemPrice: 50,
      isOpenPrice: false,
      customPrice: 0,
      selectedSizePrice: 80,
    })).toBe(80);
  });

  it('does not treat a zero base price as open price when a size supplies the price', () => {
    expect(resolveItemOptionPrice({
      itemPrice: 0,
      isOpenPrice: false,
      customPrice: 0,
      selectedSizePrice: 85,
    })).toBe(85);
  });

  it('falls back to the item price without a size', () => {
    expect(resolveItemOptionPrice({
      itemPrice: 50,
      isOpenPrice: false,
      customPrice: 0,
    })).toBe(50);
  });
});
