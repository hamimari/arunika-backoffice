// Keranjang Belanja: every item price is a whole Rp 1.000, so every cart
// total (at most Rp 500.000) maps to one pre-registered Google Play product.
export const PRICE_STEP_IDR = 1000;
export const MAX_CART_TOTAL_IDR = 500000;

export function isOnPriceStep(value: number | null | undefined): boolean {
  return typeof value === 'number' && value > 0 && value % PRICE_STEP_IDR === 0;
}
