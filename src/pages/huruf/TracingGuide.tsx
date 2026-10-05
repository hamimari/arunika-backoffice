import { useMemo } from 'react';
import type { HurufStroke } from '../../api/huruf';
import { GRID, type Point } from '../../lib/svgPath';
import { TEAL, sampleStrokes } from './hurufUtils';

const BAND = '#E9E0D6';
const INK = '#C85A1A';

const toD = (pts: Point[]) =>
  pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

interface Props {
  strokes: HurufStroke[];
  /** Animated demo dot position. */
  dot?: Point | null;
  /** Index (in display order) of a stroke to highlight in the editor. */
  activeIndex?: number;
  /** Shows the 300 grid lines (editor), not just writing lines (app). */
  showGrid?: boolean;
  className?: string;
  /** Extra SVG children drawn on top (e.g. a line being drawn). */
  children?: React.ReactNode;
  svgRef?: React.Ref<SVGSVGElement>;
  onPointerDown?: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerMove?: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerUp?: (e: React.PointerEvent<SVGSVGElement>) => void;
}

/** The tracing guide as the app draws it: bands with dotted centre lines,
 *  numbered start points and direction arrows, on the 300 × 300 grid. */
export default function TracingGuide({
  strokes,
  dot,
  activeIndex,
  showGrid,
  children,
  svgRef,
  ...pointer
}: Props) {
  const sampled = useMemo(() => sampleStrokes(strokes), [strokes]);
  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${GRID} ${GRID}`}
      role="img"
      aria-label="Garis panduan tebalkan"
      style={{ width: '100%', display: 'block', touchAction: 'none' }}
      {...pointer}
    >
      <rect width={GRID} height={GRID} rx={14} fill="#FAF6F1" />
      {showGrid &&
        Array.from({ length: 11 }, (_, i) => i * 30).map((v) => (
          <g key={v} stroke="#EFE8DF" strokeWidth={1}>
            <line x1={v} y1={0} x2={v} y2={GRID} />
            <line x1={0} y1={v} x2={GRID} y2={v} />
          </g>
        ))}
      <g stroke="#E2DAD0" strokeWidth={1.5}>
        <line x1={10} y1={30} x2={290} y2={30} />
        <line x1={10} y1={150} x2={290} y2={150} strokeDasharray="5 5" />
        <line x1={10} y1={260} x2={290} y2={260} />
      </g>
      {sampled.map((s) => (
        <path
          key={`band-${s.order}`}
          d={toD(s.samples)}
          fill="none"
          stroke={BAND}
          strokeWidth={34}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {sampled.map((s, i) => (
        <path
          key={`line-${s.order}`}
          d={toD(s.samples)}
          fill="none"
          stroke={i === activeIndex ? INK : '#9C9389'}
          strokeWidth={i === activeIndex ? 4 : 2.5}
          strokeDasharray={i === activeIndex ? undefined : '1 9'}
          strokeLinecap="round"
        />
      ))}
      {sampled.map((s) => {
        const pts = s.samples;
        if (pts.length < 4) return null;
        const i = Math.min(pts.length - 1, Math.max(1, Math.floor(pts.length * 0.6)));
        const angle = Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x);
        const x = pts[i].x - Math.sin(angle) * 30;
        const y = pts[i].y + Math.cos(angle) * 30;
        return (
          <g
            key={`arrow-${s.order}`}
            transform={`translate(${x} ${y}) rotate(${(angle * 180) / Math.PI})`}
            stroke={TEAL}
            strokeWidth={3.5}
            strokeLinecap="round"
            fill="none"
          >
            <path d="M-9 0 L9 0 M2 -6 L9 0 L2 6" />
          </g>
        );
      })}
      {sampled.map((s) => (
        <g key={`marker-${s.order}`}>
          <circle cx={s.samples[0].x} cy={s.samples[0].y} r={12} fill={TEAL} />
          <text
            x={s.samples[0].x}
            y={s.samples[0].y + 5}
            textAnchor="middle"
            fontSize={14}
            fontWeight={700}
            fill="#fff"
          >
            {s.order}
          </text>
        </g>
      ))}
      {dot && <circle cx={dot.x} cy={dot.y} r={12} fill="#fff" stroke={INK} strokeWidth={4} />}
      {children}
    </svg>
  );
}
