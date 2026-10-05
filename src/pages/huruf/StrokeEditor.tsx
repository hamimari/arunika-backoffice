import { useMemo, useRef, useState } from 'react';
import { Button, Input, Segmented, Space, Switch, Typography, message } from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  EditOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import type { HurufContent, HurufStroke } from '../../api/huruf';
import { GRID, importSvgStrokes, pathError } from '../../lib/svgPath';
import TracingGuide from './TracingGuide';
import { TEAL, sampleStrokes, useStrokeDemo } from './hurufUtils';

const { Text } = Typography;

type Case = 'upper' | 'lower';
type Tebalkan = HurufContent['tebalkan'];

const SNAP = 5;
const snap = (v: number) => Math.min(GRID, Math.max(0, Math.round(v / SNAP) * SNAP));

/** Renumbers strokes 1..n in their current order. */
const renumber = (strokes: HurufStroke[]) => strokes.map((s, i) => ({ ...s, order: i + 1 }));

interface Props {
  upper: string;
  lower: string;
  value: Tebalkan;
  onChange: (next: Tebalkan) => void;
  /** Publish errors keyed by path, e.g. `tebalkan.upper[0].path`. */
  errors: Record<string, string>;
}

/**
 * "Tebalkan": the tracing guide for upper and lower case. Strokes are drawn
 * as straight lines on the grid ("Gambar garis"), imported from an SVG, or
 * typed as paths; their order is the order a child traces them.
 */
export default function StrokeEditor({ upper, lower, value, onChange, errors }: Props) {
  const [tab, setTab] = useState<Case>('upper');
  const [drawing, setDrawing] = useState(false);
  const [line, setLine] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const strokes = [...(value[tab] ?? [])].sort((a, b) => a.order - b.order);
  const sampled = useMemo(() => sampleStrokes(strokes), [strokes]);
  const demo = useStrokeDemo(sampled);

  const setStrokes = (next: HurufStroke[]) => onChange({ ...value, [tab]: renumber(next) });

  const toGrid = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: snap(((e.clientX - rect.left) / rect.width) * GRID),
      y: snap(((e.clientY - rect.top) / rect.height) * GRID),
    };
  };

  const addStroke = (path: string, label = `Garis ${strokes.length + 1}`) =>
    setStrokes([...strokes, { order: strokes.length + 1, label, path }]);

  const onImport = async (file: File) => {
    const { paths, skipped } = importSvgStrokes(await file.text());
    if (paths.length === 0) {
      message.error('Tidak ada garis yang bisa dipakai di SVG ini');
      return;
    }
    setStrokes([
      ...strokes,
      ...paths.map((path, i) => ({
        order: strokes.length + i + 1,
        label: `Garis ${strokes.length + i + 1}`,
        path,
      })),
    ]);
    message.success(
      `${paths.length} garis ditambahkan${skipped ? `, ${skipped} dilewati (bukan M/L/Q/C)` : ''}`,
    );
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= strokes.length || from === to) return;
    const next = [...strokes];
    const [s] = next.splice(from, 1);
    next.splice(to, 0, s);
    setStrokes(next);
  };

  const listError = errors[`tebalkan.${tab}`];

  return (
    <div>
      <Segmented
        value={tab}
        onChange={(v) => setTab(v as Case)}
        options={[
          { label: `Huruf besar ${upper}`, value: 'upper' },
          { label: `Huruf kecil ${lower}`, value: 'lower' },
        ]}
        style={{ marginBottom: 12 }}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) 1fr', gap: 16 }}>
        <div>
          <div
            style={{
              border: drawing ? `2px solid ${TEAL}` : '1px solid #eee',
              borderRadius: 14,
              cursor: drawing ? 'crosshair' : 'default',
            }}
          >
            <TracingGuide
              strokes={strokes}
              dot={demo.dot}
              showGrid
              svgRef={svgRef}
              onPointerDown={(e) => {
                if (!drawing) return;
                const p = toGrid(e);
                setLine({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
              }}
              onPointerMove={(e) => {
                if (!drawing || !line) return;
                const p = toGrid(e);
                setLine({ ...line, x2: p.x, y2: p.y });
              }}
              onPointerUp={() => {
                if (!drawing || !line) return;
                if (line.x1 !== line.x2 || line.y1 !== line.y2) {
                  addStroke(`M${line.x1} ${line.y1} L${line.x2} ${line.y2}`);
                }
                setLine(null);
              }}
            >
              {line && (
                <line
                  x1={line.x1}
                  y1={line.y1}
                  x2={line.x2}
                  y2={line.y2}
                  stroke="#C85A1A"
                  strokeWidth={4}
                  strokeLinecap="round"
                />
              )}
            </TracingGuide>
          </div>
          <Space wrap style={{ marginTop: 8 }}>
            <Button
              size="small"
              icon={<EditOutlined />}
              type={drawing ? 'primary' : 'default'}
              onClick={() => setDrawing(!drawing)}
            >
              Gambar garis
            </Button>
            <Button size="small" icon={<UploadOutlined />} onClick={() => fileRef.current?.click()}>
              Unggah SVG
            </Button>
            <Button
              size="small"
              icon={<PlayCircleOutlined />}
              disabled={sampled.length === 0 || demo.playing}
              onClick={demo.play}
            >
              Putar contoh
            </Button>
          </Space>
          <input
            ref={fileRef}
            type="file"
            accept=".svg,image/svg+xml"
            aria-label="Unggah SVG"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImport(f);
              e.target.value = '';
            }}
          />
        </div>
        <div>
          <Text strong>Urutan garis</Text>
          {listError && (
            <div>
              <Text type="danger">{listError}</Text>
            </div>
          )}
          {strokes.map((s, i) => {
            const parseErr = pathError(s.path);
            const serverErr = errors[`tebalkan.${tab}[${i}].path`];
            return (
              <div
                key={i}
                draggable
                onDragStart={() => setDragFrom(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragFrom !== null) move(dragFrom, i);
                  setDragFrom(null);
                }}
                data-testid={`stroke-row-${i}`}
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'flex-start',
                  padding: 8,
                  marginTop: 8,
                  border: '1px solid #eee',
                  borderRadius: 10,
                  cursor: 'grab',
                }}
              >
                <span
                  style={{
                    background: TEAL,
                    color: '#fff',
                    borderRadius: '50%',
                    width: 24,
                    height: 24,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    fontWeight: 700,
                  }}
                >
                  {s.order}
                </span>
                <div style={{ flex: 1 }}>
                  <Input
                    size="small"
                    aria-label={`Nama garis ${s.order}`}
                    value={s.label}
                    onChange={(e) =>
                      setStrokes(strokes.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                    }
                  />
                  <Input
                    size="small"
                    aria-label={`Path garis ${s.order}`}
                    value={s.path}
                    status={parseErr || serverErr ? 'error' : undefined}
                    style={{ fontFamily: 'monospace', marginTop: 4 }}
                    onChange={(e) =>
                      setStrokes(strokes.map((x, j) => (j === i ? { ...x, path: e.target.value } : x)))
                    }
                  />
                  {(parseErr || serverErr) && (
                    <Text type="danger" style={{ fontSize: 12 }}>
                      {parseErr ?? serverErr}
                    </Text>
                  )}
                </div>
                <Space.Compact orientation="vertical">
                  <Button
                    size="small"
                    aria-label={`Naikkan garis ${s.order}`}
                    icon={<ArrowUpOutlined />}
                    disabled={i === 0}
                    onClick={() => move(i, i - 1)}
                  />
                  <Button
                    size="small"
                    aria-label={`Turunkan garis ${s.order}`}
                    icon={<ArrowDownOutlined />}
                    disabled={i === strokes.length - 1}
                    onClick={() => move(i, i + 1)}
                  />
                </Space.Compact>
                <Button
                  size="small"
                  danger
                  type="text"
                  aria-label={`Hapus garis ${s.order}`}
                  icon={<DeleteOutlined />}
                  onClick={() => setStrokes(strokes.filter((_, j) => j !== i))}
                />
              </div>
            );
          })}
          <Button
            block
            type="dashed"
            icon={<PlusOutlined />}
            style={{ marginTop: 8 }}
            onClick={() => addStroke('M150 50 L150 250')}
          >
            Tambah garis
          </Button>
          <div
            style={{
              marginTop: 12,
              padding: 12,
              background: '#FAF6F1',
              borderRadius: 10,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div>
              <Text strong>Huruf kecil wajib</Text>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Anak juga harus menebalkan "{lower}" agar huruf selesai
                </Text>
              </div>
              {errors['tebalkan.lower'] && (
                <Text type="danger" style={{ fontSize: 12 }}>
                  {errors['tebalkan.lower']}
                </Text>
              )}
            </div>
            <Switch
              aria-label="Huruf kecil wajib"
              checked={value.lower_required}
              onChange={(v) => onChange({ ...value, lower_required: v })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
