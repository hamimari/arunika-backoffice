import { useRef, useState } from 'react';
import { Button, Input, Progress, Segmented, Space, Typography } from 'antd';
import { PauseCircleFilled, PlayCircleFilled, UploadOutlined } from '@ant-design/icons';
import { assetsApi, uploadErrorText, type Asset, type AssetKind } from '../../api/assets';
import { mediaUrl } from '../../api/client';
import { urlWarning } from './hurufUtils';

const { Text } = Typography;

const kb = (bytes: number) => `${Math.round(bytes / 1024)} KB`;
const seconds = (ms: number) => `${(ms / 1000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} detik`;

type Source = 'upload' | 'url';

interface Props {
  kind: AssetKind;
  label: string;
  asset?: Asset;
  /** The external URL used when no file is uploaded. */
  url?: string;
  onUploaded: (asset: Asset) => void;
  onUrlChange?: (url: string) => void;
  onRemove?: () => void;
  /** Publish validation message for this field. */
  error?: string;
}

/** An image or audio slot: an uploaded file (details, play, "Ganti" /
 *  "Hapus") or, with "Pakai URL", a file already hosted elsewhere (R2). */
export default function AssetField({ kind, label, asset, url = '', onUploaded, onUrlChange, onRemove, error }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [source, setSource] = useState<Source>(!asset && url ? 'url' : 'upload');
  const usingUrl = source === 'url';
  const src = usingUrl ? url.trim() : asset?.url;

  const upload = async (file: File) => {
    setUploadError(null);
    setProgress(0);
    try {
      onUploaded(await assetsApi.upload(file, kind, setProgress));
    } catch (err) {
      setUploadError(uploadErrorText(err, kind));
    } finally {
      setProgress(null);
    }
  };

  const togglePlay = () => {
    if (!src) return;
    if (playing) {
      audio.current?.pause();
      setPlaying(false);
      return;
    }
    audio.current = new Audio(mediaUrl(src));
    audio.current.onended = () => setPlaying(false);
    void audio.current.play().catch(() => setPlaying(false));
    setPlaying(true);
  };

  const warning = usingUrl && url.trim() ? urlWarning(url) : null;
  const message = uploadError ?? error ?? warning;
  return (
    <div
      style={{
        border: `1px dashed ${message ? '#ff4d4f' : '#d9d2c9'}`,
        borderRadius: 12,
        padding: 12,
      }}
    >
      <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }} wrap>
        <Space align="center">
          {kind === 'audio' && (
            <Button
              shape="circle"
              type="text"
              aria-label={`Putar ${label}`}
              disabled={!src}
              icon={playing ? <PauseCircleFilled /> : <PlayCircleFilled style={{ color: '#1F6F66' }} />}
              onClick={togglePlay}
            />
          )}
          {kind === 'image' &&
            (src ? (
              <img
                src={mediaUrl(src)}
                alt=""
                width={56}
                height={56}
                style={{ borderRadius: 8, background: '#FDE7D6' }}
              />
            ) : (
              <span
                style={{
                  width: 56,
                  height: 56,
                  display: 'inline-block',
                  borderRadius: 8,
                  background: '#f3efe9',
                }}
              />
            ))}
          <div>
            <Text strong>{label}</Text>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {usingUrl
                  ? 'File dari URL, tidak diperiksa ukurannya'
                  : asset
                    ? kind === 'image'
                      ? `${asset.original_name} · ${asset.width} × ${asset.height} · ${kb(asset.bytes)} · maks 500 KB`
                      : `${asset.original_name} · ${seconds(asset.duration_ms ?? 0)} · ${kb(asset.bytes)}`
                    : kind === 'image'
                      ? 'PNG atau WebP persegi · maks 500 KB'
                      : 'MP3 atau AAC · maks 10 detik · maks 300 KB'}
              </Text>
            </div>
          </div>
        </Space>
        <Space>
          {onUrlChange && (
            <Segmented<Source>
              size="small"
              aria-label={`Sumber ${label}`}
              value={source}
              onChange={setSource}
              options={[
                { label: 'Unggah file', value: 'upload' },
                { label: 'Pakai URL', value: 'url' },
              ]}
            />
          )}
          {!usingUrl && (
            <Button size="small" icon={<UploadOutlined />} onClick={() => input.current?.click()}>
              {asset ? 'Ganti' : 'Unggah'}
            </Button>
          )}
          {!usingUrl && asset && onRemove && (
            <Button size="small" danger type="text" onClick={onRemove}>
              Hapus
            </Button>
          )}
        </Space>
      </Space>
      {usingUrl && (
        <Input
          size="small"
          style={{ marginTop: 8 }}
          aria-label={`URL ${label}`}
          placeholder={
            kind === 'image'
              ? 'https://media.haloarunika.com/huruf/apel.png'
              : 'https://media.haloarunika.com/huruf/a.mp3'
          }
          value={url}
          status={message ? 'error' : undefined}
          onChange={(e) => onUrlChange?.(e.target.value)}
        />
      )}
      {progress !== null && <Progress percent={progress} size="small" />}
      {message && (
        <Text type="danger" style={{ fontSize: 12, display: 'block' }}>
          {message}
        </Text>
      )}
      <input
        ref={input}
        type="file"
        aria-label={`Unggah ${label}`}
        accept={kind === 'image' ? 'image/png,image/webp' : 'audio/mpeg,audio/aac,.mp3,.aac'}
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
