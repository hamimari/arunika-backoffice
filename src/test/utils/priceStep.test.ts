import { describe, it, expect } from 'vitest';
import { isOnPriceStep } from '../../utils/priceStep';

describe('isOnPriceStep', () => {
  it('accepts whole Rp 1.000', () => {
    expect(isOnPriceStep(1000)).toBe(true);
    expect(isOnPriceStep(15000)).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isOnPriceStep(1500)).toBe(false);
    expect(isOnPriceStep(0)).toBe(false);
    expect(isOnPriceStep(-1000)).toBe(false);
    expect(isOnPriceStep(undefined)).toBe(false);
  });
});
