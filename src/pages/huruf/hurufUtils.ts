import { useEffect, useRef, useState } from 'react';
import type { FieldError, HurufStroke } from '../../api/huruf';
import { parsePath, samplePath, type Point } from '../../lib/svgPath';

export const TEAL = '#1F6F66';

// Shared with the Angka editors; re-exported for the Huruf pages.
export { AUTOSAVE_MS, statusGroup, urlWarning, type StatusFilter } from '../../components/content/contentUtils';

/** Indonesian text for a publish validation error. */
export function fieldErrorText(e: FieldError, upper: string): string {
  switch (e.code) {
    case 'REQUIRED':
      return 'Wajib diisi sebelum terbit';
    case 'TOO_LONG':
      return 'Terlalu panjang';
    case 'INVALID':
      return `Huruf yang disorot harus huruf ${upper}`;
    case 'NOT_FOUND':
      return 'File tidak ditemukan, unggah ulang';
    case 'WRONG_KIND':
      return 'Jenis file salah';
    case 'INVALID_URL':
      return 'URL harus lengkap dan diawali https://';
    case 'INVALID_PATH':
      return 'Path garis tidak valid';
    case 'ORDER_INVALID':
      return 'Urutan garis harus 1, 2, 3…';
    default:
      return e.code;
  }
}

export interface Sampled {
  order: number;
  samples: Point[];
}

/** Valid strokes, sampled like the app does, in order. */
export function sampleStrokes(strokes: HurufStroke[]): Sampled[] {
  const out: Sampled[] = [];
  for (const s of [...strokes].sort((a, b) => a.order - b.order)) {
    try {
      out.push({ order: s.order, samples: samplePath(parsePath(s.path)) });
    } catch {
      // Invalid strokes are flagged in the stroke list, not drawn.
    }
  }
  return out;
}

/**
 * "Putar contoh": a dot runs along each stroke in order, 600 ms per stroke —
 * the same animation the app plays. Returns the dot position (or null) and
 * a function to start it.
 */
export function useStrokeDemo(strokes: Sampled[]) {
  const [dot, setDot] = useState<Point | null>(null);
  const frame = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    },
    [],
  );
  const play = () => {
    if (strokes.length === 0) return;
    const started = performance.now();
    const step = (now: number) => {
      const t = (now - started) / 600;
      if (t >= strokes.length) {
        setDot(null);
        frame.current = null;
        return;
      }
      const s = strokes[Math.floor(t)].samples;
      setDot(s[Math.round((t % 1) * (s.length - 1))]);
      frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  };
  return { dot, play, playing: dot !== null };
}
