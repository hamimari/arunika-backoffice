// Rules for dongeng page images. The app draws each page full-bleed on a
// landscape phone (about 2:1) with BoxFit.cover, so an image much taller
// than 16:9 loses its bottom (and top) — a 4:3 image loses ~38% of its height.

export const PAGE_IMAGE_MIN_RATIO = 1.7;
export const PAGE_IMAGE_MAX_RATIO = 2.0;
export const PAGE_IMAGE_MIN_WIDTH = 1280;
/** Screen shape the preview uses to show what a phone crops away. */
export const PHONE_SCREEN_RATIO = 2.0;

export interface ImageSize {
  width: number;
  height: number;
}

export type PageImageResult = 'ok' | 'too_narrow' | 'too_tall' | 'too_wide';

export function checkPageImage({ width, height }: ImageSize): PageImageResult {
  const ratio = width / height;
  if (ratio < PAGE_IMAGE_MIN_RATIO) return 'too_tall';
  if (ratio > PAGE_IMAGE_MAX_RATIO) return 'too_wide';
  if (width < PAGE_IMAGE_MIN_WIDTH) return 'too_narrow';
  return 'ok';
}

export function pageImageError(size: ImageSize, result: Exclude<PageImageResult, 'ok'>): string {
  const dims = `${size.width}×${size.height}`;
  switch (result) {
    case 'too_tall':
      return `Image is ${dims}: too tall for a landscape page. Crop it to about 16:9 (width ÷ height between ${PAGE_IMAGE_MIN_RATIO.toFixed(2)} and ${PAGE_IMAGE_MAX_RATIO.toFixed(2)}).`;
    case 'too_wide':
      return `Image is ${dims}: too wide for a landscape page. Crop it to about 16:9 (width ÷ height between ${PAGE_IMAGE_MIN_RATIO.toFixed(2)} and ${PAGE_IMAGE_MAX_RATIO.toFixed(2)}).`;
    case 'too_narrow':
      return `Image is ${dims}: it must be at least ${PAGE_IMAGE_MIN_WIDTH} px wide.`;
  }
}

export const PAGE_IMAGE_LOAD_ERROR = 'Could not load this image — check the URL or your network';

/** Fraction of the image height a phone screen crops away, split evenly top and bottom. */
export function croppedHeightFraction({ width, height }: ImageSize): number {
  const visible = width / PHONE_SCREEN_RATIO / height;
  return visible >= 1 ? 0 : 1 - visible;
}

/**
 * Loads `url` in an <img> and resolves its natural size. Reading
 * naturalWidth works cross-origin without CORS, since no pixels are read.
 */
export function loadImageSize(url: string): Promise<ImageSize> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error(PAGE_IMAGE_LOAD_ERROR));
    img.src = url;
  });
}
