import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Col, Input, InputNumber, Modal, Row, Space, Spin, Switch, Tag, Typography, message } from 'antd';
import { HistoryOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { errorCode, hurufApi, validationFields, type HurufContent, type HurufDraft } from '../../api/huruf';
import type { Asset } from '../../api/assets';
import { useCanPublish } from '../../store/authStore';
import AssetField from '../../components/content/AssetField';
import HistoryDrawer from '../../components/content/HistoryDrawer';
import PhonePreview, { HighlightedWord } from './PhonePreview';
import StrokeEditor from './StrokeEditor';
import StatusTag from '../../components/content/StatusTag';
import { AUTOSAVE_MS, fieldErrorText } from './hurufUtils';

const { Text, Title } = Typography;

const savedLine = (d: HurufDraft) =>
  `Versi terbit: ${d.version ? `v${d.version}` : '—'} · Draft disimpan ${new Date(d.updated_at).toLocaleString('id-ID')}${
    d.updated_by ? ` oleh ${d.updated_by}` : ''
  }`;

/** One letter's editor: Identitas, Kenali, Dengar, Tebalkan, Umpan balik,
 *  with autosave, publishing, history and a live phone preview. */
export default function HurufEditorPage() {
  const { id = '' } = useParams();
  const [generation, setGeneration] = useState(0);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['huruf-draft', id],
    queryFn: () => hurufApi.getDraft(id),
  });
  if (isLoading || !data) {
    return <Spin style={{ display: 'block', margin: '80px auto' }} />;
  }
  // Remounting with the server's latest draft (after publish, rollback or a
  // conflict) discards local edit state cleanly.
  return (
    <LetterEditor
      key={`${id}-${generation}`}
      id={id}
      initial={data}
      reload={async () => {
        await refetch();
        setGeneration((g) => g + 1);
      }}
    />
  );
}

interface EditorProps {
  id: string;
  initial: HurufDraft;
  reload: () => Promise<void>;
}

function LetterEditor({ id, initial, reload }: EditorProps) {
  const canPublish = useCanPublish();
  const queryClient = useQueryClient();
  const [meta, setMeta] = useState<HurufDraft>(initial);
  const [draft, setDraft] = useState<HurufContent>(initial.draft);
  const [assets, setAssets] = useState<Record<string, Asset>>(initial.assets ?? {});
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [historyOpen, setHistoryOpen] = useState(false);
  const rev = useRef(initial.draft_rev);

  const save = useMutation({
    mutationFn: (d: HurufContent) => hurufApi.saveDraft(id, d, rev.current),
    onSuccess: (res) => {
      rev.current = res.draft_rev;
      setMeta(res);
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ['huruf-letters'] });
    },
    onError: (err) => {
      if (errorCode(err) === 'DRAFT_CONFLICT') {
        Modal.confirm({
          title: 'Draft diubah oleh orang lain',
          content: 'Muat ulang untuk melihat versi terbaru. Perubahanmu yang belum tersimpan akan hilang.',
          okText: 'Muat ulang',
          cancelText: 'Tetap di sini',
          onOk: reload,
        });
      } else {
        message.error('Draft gagal disimpan');
      }
    },
  });

  // Autosave AUTOSAVE_MS after the last edit.
  useEffect(() => {
    if (!dirty || save.isPending) return;
    const t = setTimeout(() => save.mutate(draft), AUTOSAVE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, dirty]);

  const publish = useMutation({
    mutationFn: async () => {
      if (dirty) await save.mutateAsync(draft);
      return hurufApi.publish(id);
    },
    onSuccess: async (res) => {
      setErrors({});
      message.success(`Huruf ${meta.upper} terbit sebagai v${res.version}`);
      queryClient.invalidateQueries({ queryKey: ['huruf-letters'] });
      await reload();
    },
    onError: (err) => {
      const fields = validationFields(err);
      if (fields.length > 0) {
        const map: Record<string, string> = {};
        for (const f of fields) map[f.path] = fieldErrorText(f, meta.upper);
        setErrors(map);
        message.error('Draft belum lengkap — periksa kolom yang ditandai');
      } else if (errorCode(err) !== 'DRAFT_CONFLICT') {
        message.error('Gagal menerbitkan');
      }
    },
  });

  const visibility = useMutation({
    mutationFn: (show: boolean) => (show ? hurufApi.unhide(id) : hurufApi.hide(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['huruf-letters'] });
      void reload();
    },
    onError: () => message.error('Gagal mengubah tampilan huruf'),
  });

  const setFree = useMutation({
    mutationFn: (free: boolean) => (free ? hurufApi.setFree(id) : hurufApi.unsetFree(id)),
    onSuccess: (_, free) => {
      message.success(free ? `Huruf ${meta.upper} sekarang gratis untuk semua` : `Huruf ${meta.upper} sekarang butuh Akses Premium`);
      queryClient.invalidateQueries({ queryKey: ['huruf-letters'] });
      void reload();
    },
    onError: () => message.error('Gagal mengubah huruf gratis'),
  });

  const edit = (next: HurufContent) => {
    setDraft(next);
    setDirty(true);
    if (Object.keys(errors).length) setErrors({});
  };
  const addAsset = (a: Asset) => setAssets((m) => ({ ...m, [a.id]: a }));
  const asset = (assetId: string | null) => (assetId ? assets[assetId] : undefined);

  const chars = Array.from(draft.kenali.word);
  const toggleHighlight = (i: number) => {
    const h = draft.kenali.highlight.includes(i)
      ? draft.kenali.highlight.filter((x) => x !== i)
      : [...draft.kenali.highlight, i].sort((a, b) => a - b);
    edit({ ...draft, kenali: { ...draft.kenali, highlight: h } });
  };
  const setWord = (word: string) => {
    const len = Array.from(word).length;
    let highlight = draft.kenali.highlight.filter((i) => i < len);
    if (highlight.length === 0 && word[0]?.toUpperCase() === meta.upper) highlight = [0];
    edit({ ...draft, kenali: { ...draft.kenali, word, highlight } });
  };

  const unpublished = meta.has_unpublished_changes || dirty;
  const publisherOnly = canPublish ? undefined : 'Butuh peran Publisher';

  return (
    <>
      <Text type="secondary">
        <Link to="/huruf">Konten Belajar / Huruf</Link> / {meta.upper}
      </Text>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <Space align="center">
            <Title level={2} style={{ margin: 0 }}>
              Huruf {meta.upper}
            </Title>
            {unpublished && meta.version != null && <Tag color="gold">Ada perubahan belum terbit</Tag>}
            <StatusTag item={meta} />
          </Space>
          <div>
            <Text type="secondary">
              {save.isPending ? 'Menyimpan…' : dirty ? 'Ada perubahan yang belum disimpan' : savedLine(meta)}
            </Text>
          </div>
        </div>
        <Space>
          <Button icon={<HistoryOutlined />} onClick={() => setHistoryOpen(true)}>
            Riwayat versi
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate(draft)}>
            Simpan draft
          </Button>
          <Button
            type="primary"
            disabled={!canPublish}
            title={publisherOnly}
            loading={publish.isPending}
            onClick={() =>
              Modal.confirm({
                title: `Terbitkan huruf ${meta.upper}?`,
                content: 'Perubahan tampil di aplikasi dalam ±15 menit.',
                okText: 'Terbitkan',
                cancelText: 'Batal',
                onOk: () => publish.mutate(),
              })
            }
          >
            Terbitkan
          </Button>
        </Space>
      </div>
      {Object.keys(errors).length > 0 && (
        <Alert
          type="error"
          showIcon
          style={{ marginTop: 12 }}
          title="Draft belum bisa diterbitkan. Lengkapi kolom yang ditandai merah."
        />
      )}

      <Row gutter={24} style={{ marginTop: 16 }}>
        <Col xs={24} xl={15}>
          <Space orientation="vertical" size={16} style={{ width: '100%' }}>
            <Card title="Identitas">
              <Row gutter={16}>
                <Col span={5}>
                  <Text>Huruf besar</Text>
                  <Input value={meta.upper} disabled />
                </Col>
                <Col span={5}>
                  <Text>Huruf kecil</Text>
                  <Input value={meta.lower} disabled />
                </Col>
                <Col span={4}>
                  <Text>Urutan tampil</Text>
                  <InputNumber value={meta.sort_order} disabled style={{ width: '100%' }} />
                </Col>
                <Col span={5}>
                  <Text>Tampil di aplikasi</Text>
                  <div>
                    <Switch
                      aria-label="Tampil di aplikasi"
                      checked={meta.status !== 'hidden'}
                      disabled={!canPublish}
                      loading={visibility.isPending}
                      onChange={(v) => visibility.mutate(v)}
                    />
                  </div>
                </Col>
                <Col span={5}>
                  <Text>Gratis untuk semua</Text>
                  <div>
                    <Switch
                      aria-label="Gratis untuk semua"
                      checked={meta.is_free}
                      disabled={!canPublish}
                      loading={setFree.isPending}
                      onChange={(v) => setFree.mutate(v)}
                    />
                  </div>
                </Col>
              </Row>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Hanya satu huruf yang bisa gratis: menyalakannya di sini mematikan huruf gratis sebelumnya. Huruf gratis bisa
                dibuka tanpa Akses Premium sebagai contoh.
                {!canPublish && ' Mengubah tampilan dan huruf gratis butuh peran Publisher.'}
              </Text>
            </Card>

            <Card title="Kenali" extra={<Text type="secondary">Huruf, kata contoh, dan gambarnya</Text>}>
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Text>Kata contoh</Text>
                  <Input
                    aria-label="Kata contoh"
                    value={draft.kenali.word}
                    maxLength={20}
                    status={errors['kenali.word'] ? 'error' : undefined}
                    onChange={(e) => setWord(e.target.value)}
                  />
                  {errors['kenali.word'] && <Text type="danger" style={{ fontSize: 12 }}>{errors['kenali.word']}</Text>}
                  <div style={{ marginTop: 12 }}>
                    <Text>Huruf yang disorot</Text>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                      {chars.map((ch, i) => (
                        <Button
                          key={i}
                          size="small"
                          aria-pressed={draft.kenali.highlight.includes(i)}
                          type={draft.kenali.highlight.includes(i) ? 'primary' : 'default'}
                          onClick={() => toggleHighlight(i)}
                        >
                          {ch}
                        </Button>
                      ))}
                    </div>
                    {errors['kenali.highlight'] && (
                      <Text type="danger" style={{ fontSize: 12 }}>{errors['kenali.highlight']}</Text>
                    )}
                    {draft.kenali.word && (
                      <div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Tampil sebagai <HighlightedWord word={draft.kenali.word} highlight={draft.kenali.highlight} /> di
                          aplikasi.
                        </Text>
                      </div>
                    )}
                  </div>
                </Col>
                <Col xs={24} md={12}>
                  <Text>Gambar</Text>
                  <AssetField
                    kind="image"
                    label={draft.kenali.word || 'Gambar kata'}
                    asset={asset(draft.kenali.image_asset_id)}
                    url={draft.kenali.image_url}
                    error={errors['kenali.image_asset_id'] ?? errors['kenali.image_url']}
                    onUploaded={(a) => {
                      addAsset(a);
                      edit({ ...draft, kenali: { ...draft.kenali, image_asset_id: a.id, image_url: '' } });
                    }}
                    onUrlChange={(url) => edit({ ...draft, kenali: { ...draft.kenali, image_asset_id: null, image_url: url } })}
                    onRemove={() => edit({ ...draft, kenali: { ...draft.kenali, image_asset_id: null } })}
                  />
                </Col>
              </Row>
            </Card>

            <Card title="Dengar" extra={<Text type="secondary">Unggah rekaman · MP3 atau AAC · maks 10 detik · maks 300 KB, atau pakai URL</Text>}>
              <Space orientation="vertical" style={{ width: '100%' }}>
                <AssetField
                  kind="audio"
                  label={`Bunyi huruf "${meta.upper}"`}
                  asset={asset(draft.dengar.letter_audio_id)}
                  url={draft.dengar.letter_audio_url}
                  error={errors['dengar.letter_audio_id'] ?? errors['dengar.letter_audio_url']}
                  onUploaded={(a) => {
                    addAsset(a);
                    edit({ ...draft, dengar: { ...draft.dengar, letter_audio_id: a.id, letter_audio_url: '' } });
                  }}
                  onUrlChange={(url) =>
                    edit({ ...draft, dengar: { ...draft.dengar, letter_audio_id: null, letter_audio_url: url } })
                  }
                />
                <AssetField
                  kind="audio"
                  label={`Bunyi kata "${draft.kenali.word || '…'}"`}
                  asset={asset(draft.dengar.word_audio_id)}
                  url={draft.dengar.word_audio_url}
                  error={errors['dengar.word_audio_id'] ?? errors['dengar.word_audio_url']}
                  onUploaded={(a) => {
                    addAsset(a);
                    edit({ ...draft, dengar: { ...draft.dengar, word_audio_id: a.id, word_audio_url: '' } });
                  }}
                  onUrlChange={(url) =>
                    edit({ ...draft, dengar: { ...draft.dengar, word_audio_id: null, word_audio_url: url } })
                  }
                />
              </Space>
            </Card>

            <Card title="Tebalkan" extra={<Text type="secondary">Garis panduan pada grid 300 × 300, urutan dan arah menentukan penilaian</Text>}>
              <StrokeEditor
                upper={meta.upper}
                lower={meta.lower}
                value={draft.tebalkan}
                errors={errors}
                onChange={(t) => edit({ ...draft, tebalkan: t })}
              />
            </Card>

            <Card title="Umpan balik" extra={<Text type="secondary">Teks pada pop-up setelah menebalkan</Text>}>
              <Row gutter={16}>
                <Col span={12}>
                  <Text>Judul berhasil</Text>
                  <Input
                    aria-label="Judul berhasil"
                    value={draft.feedback.success}
                    maxLength={80}
                    status={errors['feedback.success'] ? 'error' : undefined}
                    onChange={(e) => edit({ ...draft, feedback: { ...draft.feedback, success: e.target.value } })}
                  />
                </Col>
                <Col span={12}>
                  <Text>Judul belum pas</Text>
                  <Input
                    aria-label="Judul belum pas"
                    value={draft.feedback.retry}
                    maxLength={80}
                    status={errors['feedback.retry'] ? 'error' : undefined}
                    onChange={(e) => edit({ ...draft, feedback: { ...draft.feedback, retry: e.target.value } })}
                  />
                </Col>
              </Row>
              <div style={{ marginTop: 12 }}>
                <Text>Petunjuk saat belum pas</Text>
                <Input.TextArea
                  aria-label="Petunjuk saat belum pas"
                  value={draft.feedback.hint}
                  maxLength={160}
                  autoSize={{ minRows: 2 }}
                  status={errors['feedback.hint'] ? 'error' : undefined}
                  onChange={(e) => edit({ ...draft, feedback: { ...draft.feedback, hint: e.target.value } })}
                />
              </div>
            </Card>
          </Space>
        </Col>
        <Col xs={24} xl={9}>
          <div style={{ position: 'sticky', top: 16 }}>
            <Card title="Pratinjau" extra={<Text type="secondary">Draft, belum terbit</Text>}>
              <PhonePreview letterId={id} draft={draft} />
            </Card>
          </div>
        </Col>
      </Row>

      <HistoryDrawer
        entityType="letter"
        entityId={id}
        loadVersions={() => hurufApi.versions(id)}
        rollback={(v) => hurufApi.rollback(id, v)}
        listQueryKey={['huruf-letters']}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onRolledBack={() => void reload()}
      />
    </>
  );
}
