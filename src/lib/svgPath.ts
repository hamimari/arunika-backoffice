/**
 * Belajar Huruf stroke paths: one open subpath of absolute M, L, Q and C
 * commands on the 300 × 300 grid.
 *
 * A port of the backend's `hurufpath` package (and the app's
 * `svg_path.dart`). All three must accept and reject exactly the paths in
 * `svg_paths.json`, so what the editor accepts always publishes and always
 * parses on the device.
 */
export const GRID = 300;

export interface Point {
  x: number;
  y: number;
}

export interface Segment {
  cmd: 'L' | 'Q' | 'C';
  points: Point[];
}

export interface TracePath {
  start: Point;
  segments: Segment[];
}

const ARITY: Record<string, number> = { M: 1, L: 1, Q: 2, C: 3 };

type Token = { cmd: string } | { num: number };

function tokenize(s: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const isDigit = (c: string) => c >= '0' && c <= '9';
  while (i < s.length) {
    const c = s[i];
    if (c === ' ' || c === ',' || c === '\t' || c === '\n' || c === '\r') {
      i++;
    } else if (c in ARITY) {
      out.push({ cmd: c });
      i++;
    } else if (c === '-' || c === '+' || c === '.' || isDigit(c)) {
      let j = i;
      if (s[j] === '-' || s[j] === '+') j++;
      let digits = 0;
      while (j < s.length && isDigit(s[j])) {
        j++;
        digits++;
      }
      if (j < s.length && s[j] === '.') {
        j++;
        while (j < s.length && isDigit(s[j])) {
          j++;
          digits++;
        }
      }
      if (digits === 0) throw new Error(`bad number at ${i}`);
      out.push({ num: Number(s.slice(i, j)) });
      i = j;
    } else {
      throw new Error(`unsupported character "${c}" at ${i}`);
    }
  }
  return out;
}

/** Parses and validates a stroke path; throws an Error explaining why not. */
export function parsePath(s: string): TracePath {
  const toks = tokenize(s);
  if (toks.length === 0) throw new Error('empty path');
  if (!('cmd' in toks[0]) || toks[0].cmd !== 'M') throw new Error('path must start with M');
  let start: Point | null = null;
  const segments: Segment[] = [];
  let cmd = '';
  let i = 0;
  while (i < toks.length) {
    const t = toks[i];
    if ('cmd' in t) {
      cmd = t.cmd;
      if (cmd === 'M' && start) throw new Error('only one subpath is allowed');
      i++;
    } else if (cmd === 'M') {
      // Extra coordinate pairs after M are implicit L commands (SVG).
      cmd = 'L';
    }
    const n = ARITY[cmd];
    if (i + 2 * n > toks.length) throw new Error(`${cmd} needs ${2 * n} coordinates`);
    const pts: Point[] = [];
    for (let k = 0; k < n; k++) {
      const x = toks[i + 2 * k];
      const y = toks[i + 2 * k + 1];
      if (!('num' in x) || !('num' in y)) throw new Error(`${cmd} needs ${2 * n} coordinates`);
      if (x.num < 0 || x.num > GRID || y.num < 0 || y.num > GRID) {
        throw new Error(`(${x.num}, ${y.num}) is outside the ${GRID} grid`);
      }
      pts.push({ x: x.num, y: y.num });
    }
    i += 2 * n;
    if (cmd === 'M') start = pts[0];
    else segments.push({ cmd: cmd as Segment['cmd'], points: pts });
  }
  if (segments.length === 0) throw new Error('path needs a segment after M');
  return { start: start!, segments };
}

/** The parse error message, or null when [s] is valid. */
export function pathError(s: string): string | null {
  try {
    parsePath(s);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

const lerp = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

/** Points every [spacing] units along the stroke, ends included (as the app). */
export function samplePath(p: TracePath, spacing = 4): Point[] {
  const poly: Point[] = [p.start];
  let cur = p.start;
  for (const seg of p.segments) {
    const end = seg.points[seg.points.length - 1];
    if (seg.cmd === 'L') {
      poly.push(end);
    } else {
      const ctrl = [cur, ...seg.points];
      let len = 0;
      for (let i = 1; i < ctrl.length; i++) len += dist(ctrl[i - 1], ctrl[i]);
      const steps = Math.max(8, Math.ceil(len));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const u = 1 - t;
        if (seg.cmd === 'Q') {
          const [c, e] = seg.points;
          poly.push({
            x: u * u * cur.x + 2 * u * t * c.x + t * t * e.x,
            y: u * u * cur.y + 2 * u * t * c.y + t * t * e.y,
          });
        } else {
          const [c1, c2, e] = seg.points;
          poly.push({
            x: u * u * u * cur.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * e.x,
            y: u * u * u * cur.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * e.y,
          });
        }
      }
    }
    cur = end;
  }
  const out: Point[] = [poly[0]];
  let carried = 0;
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1];
    const b = poly[i];
    const segLen = dist(a, b);
    if (segLen === 0) continue;
    let along = spacing - carried;
    while (along <= segLen) {
      out.push(lerp(a, b, along / segLen));
      along += spacing;
    }
    carried = segLen - (along - spacing);
  }
  const last = poly[poly.length - 1];
  if (dist(out[out.length - 1], last) > 0.5) out.push(last);
  return out;
}

/** Imports the strokes of an uploaded SVG: each `<path d>` in document
 *  order, scaled from its viewBox to the 300 grid. Invalid ones are skipped
 *  and reported. */
export function importSvgStrokes(svgText: string): { paths: string[]; skipped: number } {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  const vb = svg?.getAttribute('viewBox')?.split(/[\s,]+/).map(Number);
  const [minX, minY, w, h] = vb && vb.length === 4 && vb.every(Number.isFinite) ? vb : [0, 0, GRID, GRID];
  const scale = GRID / Math.max(w, h);
  const paths: string[] = [];
  let skipped = 0;
  for (const el of Array.from(doc.querySelectorAll('path'))) {
    const d = el.getAttribute('d') ?? '';
    try {
      const p = parsePath(scaleRaw(d, minX, minY, scale));
      paths.push(formatPath(p));
    } catch {
      skipped++;
    }
  }
  return { paths, skipped };
}

/** Scales every coordinate pair of an absolute path (before validation). */
function scaleRaw(d: string, minX: number, minY: number, scale: number): string {
  let isX = true;
  return d.replace(/[-+]?(\d+\.?\d*|\.\d+)|[A-Za-z]/g, (m) => {
    if (/[A-Za-z]/.test(m)) {
      isX = true;
      return ` ${m} `;
    }
    const v = Number(m);
    const out = isX ? (v - minX) * scale : (v - minY) * scale;
    isX = !isX;
    return String(Math.round(out * 10) / 10);
  });
}

const fmt = (n: number) => String(Math.round(n * 10) / 10);

/** Canonical text form of a parsed path. */
export function formatPath(p: TracePath): string {
  const parts = [`M${fmt(p.start.x)} ${fmt(p.start.y)}`];
  for (const s of p.segments) {
    parts.push(s.cmd + s.points.map((pt) => `${fmt(pt.x)} ${fmt(pt.y)}`).join(' '));
  }
  return parts.join(' ');
}
