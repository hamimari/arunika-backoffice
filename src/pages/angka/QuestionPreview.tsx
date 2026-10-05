import { useEffect, useState } from 'react';
import { Button, Space, Spin, Typography } from 'antd';
import { LeftOutlined, RightOutlined, SoundOutlined, SwapOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { angkaApi, type AngkaLevelContent, type AngkaPreviewQuestion } from '../../api/angka';
import { mediaUrl } from '../../api/client';
import { ANGKA_BLUE, RUST, randomSeed } from './angkaUtils';

const { Text } = Typography;

/** The generator's logical picture area. */
const AREA_W = 320;
const AREA_H = 180;
/** Width of the phone's picture area in px. */
const PANEL_W = 236;

/** Returns [value], updated [ms] after it stops changing. */
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

interface Props {
  levelId: string;
  levelNumber: number;
  draft: AngkaLevelContent;
  /** Starting seed; tests pass a fixed one. */
  initialSeed?: number;
}

/** "Pratinjau soal": questions the app's generator makes from the unsaved
 *  draft, in the question screen's layout, with a working number pad. */
export default function QuestionPreview({ levelId, levelNumber, draft, initialSeed }: Props) {
  const [seed, setSeed] = useState(() => initialSeed ?? randomSeed());
  const [k, setK] = useState(0);
  const settled = useDebounced(draft, 500);
  const { data, isFetching, isError } = useQuery({
    queryKey: ['angka-preview', levelId, JSON.stringify(settled), seed],
    queryFn: () => angkaApi.levels.preview(levelId, settled, seed),
    placeholderData: (prev) => prev,
    retry: false,
  });
  const questions = data?.questions ?? [];
  const index = Math.min(k, Math.max(questions.length - 1, 0));
  const q = questions[index];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div>
          <Text strong>Pratinjau soal</Text>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {questions.length ? `Contoh soal ${index + 1} dari ${questions.length} · draft` : 'Draft'}
            </Text>
          </div>
        </div>
        <Space size={4}>
          <Button
            size="small"
            aria-label="Soal sebelumnya"
            icon={<LeftOutlined />}
            disabled={index === 0}
            onClick={() => setK(index - 1)}
          />
          <Button
            size="small"
            aria-label="Soal berikutnya"
            icon={<RightOutlined />}
            disabled={index >= questions.length - 1}
            onClick={() => setK(index + 1)}
          />
          <Button
            size="small"
            icon={<SwapOutlined />}
            onClick={() => {
              setSeed(randomSeed());
              setK(0);
            }}
          >
            Acak ulang
          </Button>
        </Space>
      </div>
      <div
        style={{
          border: '10px solid #1f1f1f',
          borderRadius: 32,
          padding: 12,
          background: '#FBF6F0',
          minHeight: 520,
          position: 'relative',
        }}
      >
        {isError ? (
          <Text type="secondary">Atur rentang 1–20 dan 5–20 soal untuk melihat pratinjau.</Text>
        ) : !q ? (
          <Spin style={{ display: 'block', margin: '120px auto' }} spinning={isFetching} />
        ) : (
          <PreviewQuestion
            key={`${seed}-${index}`}
            q={q}
            header={`Level ${levelNumber} · Soal ${index + 1} dari ${questions.length}`}
            progress={index / questions.length}
            draft={settled}
          />
        )}
      </div>
      <Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 8, textAlign: 'center' }}>
        Soal di aplikasi dibuat dengan cara yang sama, jadi pratinjau ini sesuai dengan yang dilihat anak.
      </Text>
    </div>
  );
}

interface QuestionProps {
  q: AngkaPreviewQuestion;
  header: string;
  progress: number;
  draft: AngkaLevelContent;
}

function PreviewQuestion({ q, header, progress, draft }: QuestionProps) {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<'right' | 'wrong' | null>(null);
  const benda = q.object?.name ?? 'benda';
  const scale = PANEL_W / AREA_W;
  const side = q.size * scale;

  const type = (d: number) => {
    setResult(null);
    setInput((s) => (s.length >= 2 ? s : `${s}${d}`));
  };
  const check = () => setResult(Number(input) === q.count ? 'right' : 'wrong');
  const speak = () => {
    if (q.object?.question_audio_url)
      void new Audio(mediaUrl(q.object.question_audio_url)).play().catch(() => undefined);
  };

  const key = (label: string, onClick: () => void, opts: { bg?: string; color?: string; disabled?: boolean } = {}) => (
    <button
      key={label}
      type="button"
      aria-label={label === '⌫' ? 'Hapus' : label}
      disabled={opts.disabled}
      onClick={onClick}
      style={{
        height: 38,
        borderRadius: 10,
        border: 'none',
        borderBottom: '3px solid rgba(0,0,0,0.08)',
        background: opts.bg ?? '#fff',
        color: opts.color ?? '#2b2118',
        fontWeight: 700,
        fontSize: label.length > 1 ? 13 : 18,
        opacity: opts.disabled ? 0.5 : 1,
        cursor: opts.disabled ? 'default' : 'pointer',
      }}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 26, height: 26, borderRadius: 8, background: '#fff', textAlign: 'center' }}>✕</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: ANGKA_BLUE }}>{header}</div>
          <div style={{ height: 5, borderRadius: 3, background: '#E6DED5' }}>
            <div style={{ width: `${progress * 100}%`, height: 5, borderRadius: 3, background: ANGKA_BLUE }} />
          </div>
        </div>
        <span style={{ fontSize: 11, background: '#fff', borderRadius: 10, padding: '2px 6px' }}>★ 0</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '12px 0 8px' }}>
        <Text strong style={{ fontSize: 17 }}>
          {q.object?.question_text || `Ada berapa ${benda}?`}
        </Text>
        <Button
          shape="circle"
          aria-label="Dengar soal"
          icon={<SoundOutlined />}
          style={{ background: ANGKA_BLUE, color: '#fff' }}
          onClick={speak}
        />
      </div>
      <div
        data-testid="preview-pictures"
        style={{
          position: 'relative',
          width: PANEL_W,
          height: AREA_H * scale,
          margin: '0 auto',
          background: '#FDEEDD',
          borderRadius: 14,
        }}
      >
        {q.points.map((p, i) =>
          q.object?.image_url ? (
            <img
              key={i}
              src={mediaUrl(q.object.image_url)}
              alt=""
              width={side}
              height={side}
              style={{ position: 'absolute', left: p.x * scale - side / 2, top: p.y * scale - side / 2 }}
            />
          ) : (
            <span
              key={i}
              style={{
                position: 'absolute',
                left: p.x * scale - side / 2,
                top: p.y * scale - side / 2,
                width: side,
                height: side,
                borderRadius: '50%',
                background: '#F2B8A0',
              }}
            />
          ),
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '10px 0' }}>
        <Text strong>Jawabanmu</Text>
        <span
          aria-label="Jawaban"
          style={{
            width: 56,
            height: 40,
            border: '2px dashed #D9CFC5',
            borderRadius: 10,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: 20,
            color: input ? ANGKA_BLUE : '#CFC4B8',
          }}
        >
          {input || '?'}
        </span>
      </div>
      {result && (
        <div
          role="status"
          style={{
            background: '#fff',
            borderRadius: 12,
            padding: 10,
            marginBottom: 8,
            textAlign: 'center',
          }}
        >
          <Text strong style={{ color: result === 'right' ? '#1F6F4A' : '#7A3A12' }}>
            {result === 'right' ? draft.feedback.success : draft.feedback.retry}
          </Text>
          {result === 'wrong' && (
            <div style={{ fontSize: 12 }}>Petunjuk: {draft.feedback.hint.replaceAll('{benda}', benda)}</div>
          )}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => key(String(d), () => type(d)))}
        {key('⌫', () => setInput((s) => s.slice(0, -1)), { bg: '#F1EBE4' })}
        {key('0', () => type(0))}
        {key('Periksa', check, { bg: RUST, color: '#fff', disabled: !input })}
      </div>
    </div>
  );
}
