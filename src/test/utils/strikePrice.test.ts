import { describe, it, expect } from 'vitest';
import dayjs from 'dayjs';
import {
  INHERIT,
  computeStrikePrice,
  formToOverride,
  overrideToForm,
  validatePromoPeriod,
} from '../../utils/strikePrice';

describe('computeStrikePrice', () => {
  // Same cases as the backend's TestComputeStrikePrice, so the preview can
  // never disagree with what the app will show.
  it.each([
    [39000, 'PERCENT', 20, 49000, 20],
    [15000, 'PERCENT', 20, 19000, 21],
    [79000, 'PERCENT', 20, 99000, 20],
    [29000, 'FIXED', 10000, 39000, 26],
  ] as const)('%i with %s %i → %i (-%i%%)', (price, mode, value, strike, pct) => {
    expect(computeStrikePrice(price, mode, value)).toEqual({ strike, discountPercent: pct });
  });

  it.each([
    [29000, 'NONE', 0],
    [0, 'FIXED', 10000],
    [29000, 'PERCENT', 95],
    [29000, 'FIXED', 0],
  ] as const)('%i with %s %i has no strike price', (price, mode, value) => {
    expect(computeStrikePrice(price, mode, value)).toBeNull();
  });
});

describe('validatePromoPeriod', () => {
  const now = dayjs('2026-10-01T00:00:00Z');

  it('accepts an end date within 90 days', () => {
    expect(validatePromoPeriod(null, now.add(30, 'day'), now)).toBeNull();
  });

  it('counts 90 days from a future start', () => {
    const start = now.add(10, 'day');
    expect(validatePromoPeriod(start, start.add(90, 'day'), now)).toBeNull();
  });

  it.each([
    ['missing end', null, null, 'End date is required for a promo'],
    ['end in the past', null, now.subtract(1, 'hour'), 'End date must be in the future'],
    ['end before start', now.add(30, 'day'), now.add(10, 'day'), 'End date must be after the start date'],
    ['longer than 90 days', null, now.add(91, 'day'), 'A promo can run for at most 90 days'],
  ])('rejects %s', (_, start, end, message) => {
    expect(validatePromoPeriod(start, end, now)).toBe(message);
  });
});

describe('override ↔ form conversion', () => {
  it('maps a null mode to "Ikuti global" and back to null', () => {
    const form = overrideToForm({ strike_mode: null });
    expect(form.strike_mode).toBe(INHERIT);
    expect(formToOverride(form)).toEqual({
      strike_mode: null,
      strike_value: null,
      strike_starts_at: null,
      strike_ends_at: null,
    });
  });

  it('keeps a promo override round-trip intact', () => {
    const override = {
      strike_mode: 'FIXED' as const,
      strike_value: 5000,
      strike_starts_at: null,
      strike_ends_at: '2026-10-31T16:59:00.000Z',
    };
    expect(formToOverride(overrideToForm(override))).toEqual(override);
  });

  it('drops the value and period when opting out', () => {
    expect(
      formToOverride({ strike_mode: 'NONE', strike_value: 20, strike_period: [null, dayjs()] }),
    ).toEqual({ strike_mode: 'NONE', strike_value: null, strike_starts_at: null, strike_ends_at: null });
  });
});
