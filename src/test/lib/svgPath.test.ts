import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/svg_paths.json';
import { formatPath, importSvgStrokes, parsePath, pathError, samplePath } from '../../lib/svgPath';

describe('svgPath', () => {
  describe('parity with the backend and app parsers', () => {
    for (const c of fixture.cases as { path: string; valid: boolean; segments?: number }[]) {
      it(`"${c.path}" is ${c.valid ? 'valid' : 'invalid'}`, () => {
        if (c.valid) {
          expect(parsePath(c.path).segments).toHaveLength(c.segments!);
        } else {
          expect(() => parsePath(c.path)).toThrow();
        }
      });
    }
  });

  it('explains why a path is invalid', () => {
    expect(pathError('M10 10 A5 5')).toMatch(/unsupported character "A"/);
    expect(pathError('M150 30 L70 260')).toBeNull();
  });

  it('samples a stroke every 4 units, ends included', () => {
    const s = samplePath(parsePath('M150 30 L70 260'));
    expect(s[0]).toEqual({ x: 150, y: 30 });
    const last = s[s.length - 1];
    expect(Math.hypot(last.x - 70, last.y - 260)).toBeLessThan(0.5);
    for (let i = 1; i < s.length - 1; i++) {
      expect(Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y)).toBeCloseTo(4, 0);
    }
    const curve = samplePath(parsePath('M50 150 Q150 0 250 150'));
    expect(Math.min(...curve.map((p) => p.y))).toBeCloseTo(75, 0);
    const cubic = samplePath(parsePath('M50 150 C50 50 250 50 250 150'));
    expect(cubic.length).toBeGreaterThan(50);
  });

  it('formats a path canonically', () => {
    expect(formatPath(parsePath('M150,30 L70,260'))).toBe('M150 30 L70 260');
    expect(formatPath(parsePath('M1 2 Q3 4 5 6'))).toBe('M1 2 Q3 4 5 6');
  });

  it('imports SVG paths scaled from the viewBox', () => {
    const svg = `<svg viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg">
      <path d="M300 60 L140 520"/>
      <path d="M300 60 L460 520"/>
      <path d="M10 10 A5 5 0 0 1 20 20"/>
    </svg>`;
    const { paths, skipped } = importSvgStrokes(svg);
    expect(paths).toEqual(['M150 30 L70 260', 'M150 30 L230 260']);
    expect(skipped).toBe(1);
  });
});
