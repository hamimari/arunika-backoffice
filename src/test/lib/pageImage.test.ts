import { describe, it, expect } from 'vitest';
import { checkPageImage, croppedHeightFraction, pageImageError } from '../../lib/pageImage';

describe('checkPageImage', () => {
  it('accepts kelinci.png (1408×768, ratio 1.83)', () => {
    expect(checkPageImage({ width: 1408, height: 768 })).toBe('ok');
  });

  it('rejects kancil-1.jpeg (2400×1792, 4:3) as too tall', () => {
    expect(checkPageImage({ width: 2400, height: 1792 })).toBe('too_tall');
  });

  it('accepts the ratio bounds 1.70 and 2.00 inclusive', () => {
    expect(checkPageImage({ width: 1700, height: 1000 })).toBe('ok');
    expect(checkPageImage({ width: 2000, height: 1000 })).toBe('ok');
  });

  it('rejects just outside the ratio bounds', () => {
    expect(checkPageImage({ width: 1699, height: 1000 })).toBe('too_tall');
    expect(checkPageImage({ width: 2001, height: 1000 })).toBe('too_wide');
    expect(checkPageImage({ width: 3000, height: 1000 })).toBe('too_wide');
  });

  it('requires at least 1280 px of width', () => {
    expect(checkPageImage({ width: 1279, height: 720 })).toBe('too_narrow');
    expect(checkPageImage({ width: 1280, height: 720 })).toBe('ok');
    expect(checkPageImage({ width: 960, height: 540 })).toBe('too_narrow');
  });
});

describe('pageImageError', () => {
  it('names the size and the fix', () => {
    const msg = pageImageError({ width: 2400, height: 1792 }, 'too_tall');
    expect(msg).toContain('2400×1792');
    expect(msg).toContain('too tall');
    expect(msg).toContain('16:9');
  });
});

describe('croppedHeightFraction', () => {
  it('is the share of height a 2:1 screen cuts off', () => {
    expect(croppedHeightFraction({ width: 2400, height: 1792 })).toBeCloseTo(1 - 1200 / 1792);
    expect(croppedHeightFraction({ width: 1408, height: 768 })).toBeCloseTo(1 - 704 / 768);
  });

  it('is zero for an image as wide as the screen or wider', () => {
    expect(croppedHeightFraction({ width: 2000, height: 1000 })).toBe(0);
  });
});
