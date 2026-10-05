import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Segmented, Typography } from 'antd';
import { PlayCircleOutlined, SoundOutlined } from '@ant-design/icons';
import { hurufApi, type HurufContent, type HurufLetterView } from '../../api/huruf';
import TracingGuide from './TracingGuide';
import { TEAL, sampleStrokes, useStrokeDemo } from './hurufUtils';
import { mediaUrl } from '../../api/client';

const { Text } = Typography;
const MINT = '#DDF1EE';

type Tab = 'kenali' | 'tebalkan';

/** The example word with the letter's positions highlighted (**A**pel). */
export function HighlightedWord({ word, highlight }: { word: string; highlight: number[] }) {
  return (
    <span data-testid="highlighted-word">
      {Array.from(word).map((ch, i) =>
        highlight.includes(i) ? (
          <b key={i} style={{ color: TEAL, textDecoration: 'underline' }}>
            {ch}
          </b>
        ) : (
          <span key={i}>{ch}</span>
        ),
      )}
    </span>
  );
}

interface Props {
  letterId: string;
  draft: HurufContent;
}

/**
 * "Pratinjau": the unsaved draft laid out like the app's Huruf screen —
 * Kenali (with its sounds) and Tebalkan — including the stroke demo. Asset ids are
 * resolved by the backend's preview endpoint (nothing is saved).
 */
export default function PhonePreview({ letterId, draft }: Props) {
  const [tab, setTab] = useState<Tab>('tebalkan');
  const [view, setView] = useState<HurufLetterView | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  // Re-resolve shortly after the draft stops changing.
  const draftKey = JSON.stringify(draft);
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      hurufApi
        .preview(letterId, JSON.parse(draftKey) as HurufContent)
        .then((v) => !cancelled && setView(v))
        .catch(() => {});
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [letterId, draftKey]);

  const strokes = draft.tebalkan.upper;
  const sampled = useMemo(() => sampleStrokes(strokes), [strokes]);
  const demo = useStrokeDemo(sampled);

  const play = (url?: string) => {
    if (!url) return;
    audio.current?.pause();
    audio.current = new Audio(mediaUrl(url));
    void audio.current.play().catch(() => {});
  };

  const word = draft.kenali.word || '—';
  return (
    <div>
      <div
        style={{
          border: '8px solid #222',
          borderRadius: 32,
          padding: 12,
          background: '#FBF6F0',
          maxWidth: 300,
          margin: '0 auto',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 8,
          }}
        >
          <Text strong style={{ fontSize: 16 }}>
            Huruf {draft.upper}
          </Text>
        </div>
        <Segmented
          block
          size="small"
          value={tab}
          onChange={(v) => setTab(v as Tab)}
          options={[
            { label: 'Kenali', value: 'kenali' },
            { label: 'Tebalkan', value: 'tebalkan' },
          ]}
        />
        {tab === 'kenali' && (
          <div
            style={{
              background: '#fff',
              borderRadius: 16,
              padding: 12,
              marginTop: 8,
              textAlign: 'center',
            }}
          >
            <div
              role="button"
              title="Putar kata"
              onClick={() => play(view?.dengar.word_audio_url)}
              style={{
                width: 140,
                height: 140,
                margin: '0 auto',
                borderRadius: 16,
                overflow: 'hidden',
                background: MINT,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              {view?.kenali.image_url ? (
                <img
                  src={mediaUrl(view.kenali.image_url)}
                  alt={word}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <Text type="secondary">Belum ada gambar</Text>
              )}
            </div>
            <div
              style={{
                color: TEAL,
                fontWeight: 800,
                fontSize: 44,
                lineHeight: 1.1,
                marginTop: 6,
              }}
            >
              {draft.upper} {draft.lower}
            </div>
            <Button
              type="text"
              icon={<SoundOutlined style={{ color: TEAL }} />}
              disabled={!view?.dengar.word_audio_url}
              onClick={() => play(view?.dengar.word_audio_url)}
              style={{ fontSize: 20, height: 'auto' }}
            >
              <HighlightedWord word={word} highlight={draft.kenali.highlight} />
            </Button>
            <Button
              block
              icon={<SoundOutlined />}
              style={{
                background: TEAL,
                color: '#fff',
                border: 'none',
                marginTop: 8,
              }}
              disabled={!view?.dengar.letter_audio_url}
              onClick={() => play(view?.dengar.letter_audio_url)}
            >
              Dengar bunyi
            </Button>
          </div>
        )}
        {tab === 'tebalkan' && (
          <>
            <div
              style={{
                background: MINT,
                borderRadius: 16,
                padding: 10,
                marginTop: 8,
                display: 'flex',
                gap: 8,
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  background: '#fff',
                  borderRadius: 12,
                  width: 72,
                  height: 72,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: TEAL,
                  fontWeight: 800,
                  fontSize: 30,
                }}
              >
                {draft.upper}
                {draft.lower}
              </div>
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <Button
                  size="small"
                  icon={<SoundOutlined />}
                  style={{ background: TEAL, color: '#fff', border: 'none' }}
                  disabled={!view?.dengar.letter_audio_url}
                  onClick={() => play(view?.dengar.letter_audio_url)}
                >
                  Dengar bunyi
                </Button>
                <Button
                  size="small"
                  disabled={!view?.dengar.word_audio_url}
                  onClick={() => play(view?.dengar.word_audio_url)}
                >
                  {view?.kenali.image_url && (
                    <img src={mediaUrl(view.kenali.image_url)} alt="" width={18} height={18} />
                  )}
                  <HighlightedWord word={word} highlight={draft.kenali.highlight} />
                </Button>
              </div>
            </div>
            <div
              style={{
                background: '#fff',
                borderRadius: 16,
                padding: 10,
                marginTop: 8,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 6,
                }}
              >
                <Text strong style={{ fontSize: 12 }}>
                  Tebalkan huruf {draft.upper}
                </Text>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  Ikuti angka dan panah
                </Text>
              </div>
              <TracingGuide strokes={strokes} dot={demo.dot} />
              <Button
                block
                size="small"
                icon={<PlayCircleOutlined />}
                style={{ marginTop: 8 }}
                disabled={sampled.length === 0 || demo.playing}
                onClick={demo.play}
              >
                Putar contoh
              </Button>
            </div>
          </>
        )}
      </div>
      <Text
        type="secondary"
        style={{
          display: 'block',
          textAlign: 'center',
          marginTop: 8,
          fontSize: 12,
        }}
      >
        Pratinjau memakai tata letak yang sama dengan aplikasi.
      </Text>
    </div>
  );
}
