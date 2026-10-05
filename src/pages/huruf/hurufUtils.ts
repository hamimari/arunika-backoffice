import { useEffect, useRef, useState } from 'react';
import type { FieldError, HurufLetterRow, HurufStroke } from '../../api/huruf';
import { parsePath, samplePath, type Point } from '../../lib/svgPath';

export const TEAL = '#1F6F66';

/** Autosave fires this long after the last edit. */
export const AUTOSAVE_MS = 2000;

export type StatusFilter = 'all' | 'published' | 'draft' | 'hidden';

/** Which status tab a letter belongs to. "Ada perubahan" counts as Terbit. */
export function statusGroup(l: HurufLetterRow): Exclude<StatusFilter, 'all'> {
  if (l.status === 'hidden') return 'hidden';
  return l.version == null ? 'draft' : 'published';
}

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

/** A problem with an external URL the backend would also refuse or the app
 *  couldn't load, or null. */
export function urlWarning(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return "URL harus lengkap, misalnya https://media.haloarunika.com/huruf/apel.png";
  }
  if (u.protocol !== "https:") return "URL harus diawali https://";
  if (u.hostname.endsWith(".r2.dev")) {
    return "Domain r2.dev diblokir sebagian provider di Indonesia. Pakai domain sendiri, misalnya media.haloarunika.com.";
  }
  return null;
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
