import dayjs, { type Dayjs } from 'dayjs';
import type { StrikeMode, StrikeOverride, StrikeStatus } from '../api/admin';

/**
 * Mirrors the backend's MaxPromoDays: a strike price is always a
 * time-limited promo, never a permanent "normal price".
 */
export const MAX_PROMO_DAYS = 90;

/** Form-only value for "follow the global rule" (sent as strike_mode: null). */
export const INHERIT = 'INHERIT';
export type StrikeModeChoice = StrikeMode | typeof INHERIT;

/** Strike-price fields as they live in an antd Form. */
export interface StrikeFormValues {
  strike_mode?: StrikeModeChoice;
  strike_value?: number | null;
  strike_period?: [Dayjs | null, Dayjs | null] | null;
}

export const STATUS_LABEL: Record<StrikeStatus, { label: string; color: string }> = {
  ACTIVE: { label: 'Aktif', color: 'green' },
  SCHEDULED: { label: 'Terjadwal', color: 'blue' },
  ENDED: { label: 'Berakhir', color: 'default' },
  OFF: { label: 'Nonaktif', color: 'default' },
};

export function formatIdr(n: number): string {
  return `Rp ${n.toLocaleString('id-ID')}`;
}

/** Formats an instant in WIB, the timezone promos are communicated in. */
export function formatWib(iso: string | Date): string {
  const text = new Date(iso).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${text} WIB`;
}

/**
 * Same formula as the backend's ComputeStrikePrice, for an instant preview
 * while typing — the server stays the source of truth.
 *   PERCENT p: price ÷ (1 − p/100), rounded up to the nearest Rp 1.000
 *   FIXED a:   price + a
 */
export function computeStrikePrice(
  price: number,
  mode: StrikeMode | undefined | null,
  value: number | undefined | null,
): { strike: number; discountPercent: number } | null {
  if (!price || price <= 0 || !mode || value == null) return null;
  let strike: number;
  if (mode === 'PERCENT') {
    if (value < 1 || value > 90) return null;
    strike = Math.ceil((price * 100) / (100 - value) / 1000) * 1000;
  } else if (mode === 'FIXED') {
    if (value < 1) return null;
    strike = price + value;
  } else {
    return null;
  }
  if (strike <= price) return null;
  return { strike, discountPercent: Math.round(((strike - price) / strike) * 100) };
}

/** Returns an error message, or null when the promo period is valid. */
export function validatePromoPeriod(
  start: Dayjs | null | undefined,
  end: Dayjs | null | undefined,
  now: Dayjs = dayjs(),
): string | null {
  if (!end) return 'End date is required for a promo';
  if (!end.isAfter(now)) return 'End date must be in the future';
  if (start && !end.isAfter(start)) return 'End date must be after the start date';
  const from = start && start.isAfter(now) ? start : now;
  if (end.diff(from, 'minute') > MAX_PROMO_DAYS * 24 * 60) {
    return `A promo can run for at most ${MAX_PROMO_DAYS} days`;
  }
  return null;
}

/** Turns stored override fields into form values for editing. */
export function overrideToForm(o: StrikeOverride): Required<StrikeFormValues> {
  return {
    strike_mode: o.strike_mode ?? INHERIT,
    strike_value: o.strike_value ?? null,
    strike_period:
      o.strike_ends_at != null
        ? [o.strike_starts_at ? dayjs(o.strike_starts_at) : null, dayjs(o.strike_ends_at)]
        : null,
  };
}

/**
 * Turns form values into the API's override payload. Inherit becomes
 * strike_mode: null; NONE and inherit carry no value or period.
 */
export function formToOverride(v: StrikeFormValues): StrikeOverride {
  const mode = v.strike_mode ?? INHERIT;
  if (mode === INHERIT) {
    return { strike_mode: null, strike_value: null, strike_starts_at: null, strike_ends_at: null };
  }
  if (mode === 'NONE') {
    return { strike_mode: 'NONE', strike_value: null, strike_starts_at: null, strike_ends_at: null };
  }
  const [start, end] = v.strike_period ?? [null, null];
  return {
    strike_mode: mode,
    strike_value: v.strike_value ?? null,
    strike_starts_at: start ? start.toISOString() : null,
    strike_ends_at: end ? end.toISOString() : null,
  };
}
