import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  Typography,
  message,
} from 'antd';
import { CheckOutlined, HistoryOutlined, MinusOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { angkaApi, type AngkaLayout, type AngkaLevelContent, type AngkaLevelDraft } from '../../api/angka';
import { errorCode, validationFields } from '../../api/huruf';
import { useCanPublish } from '../../store/authStore';
import HistoryDrawer from '../../components/content/HistoryDrawer';
import StatusTag from '../../components/content/StatusTag';
import { AUTOSAVE_MS } from '../../components/content/contentUtils';
import QuestionPreview from './QuestionPreview';
import { ANGKA_BLUE, RUST, angkaFieldErrorText, swatch } from './angkaUtils';

const { Text, Title } = Typography;

const savedLine = (d: AngkaLevelDraft) =>
  `Versi terbit: ${d.version ? `v${d.version}` : '—'} · Draft disimpan ${new Date(d.updated_at).toLocaleString('id-ID')}${
    d.updated_by ? ` oleh ${d.updated_by}` : ''
  }`;

/** One Hitung Benda level: Identitas, Soal, Penilaian and Umpan balik, with
 *  autosave, publishing, history and a question preview. */
export default function AngkaLevelEditorPage() {
  const { id = '' } = useParams();
  const [generation, setGeneration] = useState(0);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['angka-level', id],
    queryFn: () => angkaApi.levels.getDraft(id),
  });
  if (isLoading || !data) {
    return <Spin style={{ display: 'block', margin: '80px auto' }} />;
  }
  // Remounting with the server's latest draft (after publish, rollback or a
  // conflict) discards local edit state cleanly.
  return (
    <LevelEditor
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
  initial: AngkaLevelDraft;
  reload: () => Promise<void>;
}

function LevelEditor({ id, initial, reload }: EditorProps) {
  const canPublish = useCanPublish();
  const queryClient = useQueryClient();
  const [meta, setMeta] = useState<AngkaLevelDraft>(initial);
  const [draft, setDraft] = useState<AngkaLevelContent>(initial.draft);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [historyOpen, setHistoryOpen] = useState(false);
  const rev = useRef(initial.draft_rev);

  const levels = useQuery({ queryKey: ['angka-levels'], queryFn: angkaApi.levels.list });
  const objects = useQuery({ queryKey: ['angka-objects'], queryFn: angkaApi.objects.list });
  const freeLevel = levels.data?.find((l) => l.is_free);

  const refreshList = () => queryClient.invalidateQueries({ queryKey: ['angka-levels'] });

  const save = useMutation({
    mutationFn: (d: AngkaLevelContent) => angkaApi.levels.saveDraft(id, d, rev.current),
    onSuccess: (res) => {
      rev.current = res.draft_rev;
      setMeta(res);
      setDirty(false);
      void refreshList();
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
      return angkaApi.levels.publish(id);
    },
    onSuccess: async (res) => {
      setErrors({});
      message.success(`${draft.name} terbit sebagai v${res.version}`);
      void refreshList();
      await reload();
    },
    onError: (err) => {
      const fields = validationFields(err);
      if (fields.length > 0) {
        setErrors(Object.fromEntries(fields.map((f) => [f.path, angkaFieldErrorText(f)])));
        message.error('Draft belum lengkap — periksa kolom yang ditandai');
      } else if (errorCode(err) !== 'DRAFT_CONFLICT') {
        message.error('Gagal menerbitkan');
      }
    },
  });

  const visibility = useMutation({
    mutationFn: (show: boolean) => (show ? angkaApi.levels.unhide(id) : angkaApi.levels.hide(id)),
    onSuccess: () => {
      void refreshList();
      void reload();
    },
    onError: () => message.error('Gagal mengubah tampilan level'),
  });

  const setFree = useMutation({
    mutationFn: (free: boolean) => (free ? angkaApi.levels.setFree(id) : angkaApi.levels.unsetFree(id)),
    onSuccess: (_, free) => {
      message.success(
        free ? `${draft.name} sekarang gratis untuk semua` : `${draft.name} sekarang butuh Akses Premium`,
      );
      void refreshList();
      void reload();
    },
    onError: () => message.error('Gagal mengubah level gratis'),
  });

  const edit = (patch: Partial<AngkaLevelContent>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
    if (Object.keys(errors).length) setErrors({});
  };
  const toggleObject = (objectId: string) =>
    edit({
      object_ids: draft.object_ids.includes(objectId)
        ? draft.object_ids.filter((o) => o !== objectId)
        : [...draft.object_ids, objectId],
    });

  const err = (...paths: string[]) => paths.map((p) => errors[p]).find(Boolean);
  const status = (...paths: string[]) => (err(...paths) ? ('error' as const) : undefined);
  const unpublished = meta.has_unpublished_changes || dirty;
  const missingAudio = Object.keys(errors)
    .filter((k) => k.startsWith('numbers.'))
    .map((k) => Number(k.slice('numbers.'.length)))
    .sort((a, b) => a - b);
  const publisherOnly = canPublish ? undefined : 'Butuh peran Publisher';
  const n = draft.question_count;
  const usable = (objects.data ?? []).filter((o) => o.status !== 'hidden' || draft.object_ids.includes(o.id));

  return (
    <>
      <Text type="secondary">
        <Link to="/angka">Konten Belajar / Angka</Link> / Level {meta.sort_order}
      </Text>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <Space align="center">
            <Title level={2} style={{ margin: 0 }}>
              {draft.name || `Level ${meta.sort_order}`}
            </Title>
            {unpublished && meta.version != null && <Tag color="gold">Ada perubahan belum terbit</Tag>}
            <StatusTag item={meta} />
          </Space>
          <div>
            <Text type="secondary">{save.isPending ? 'Menyimpan…' : savedLine(meta)}</Text>
          </div>
        </div>
        <Space>
          <Button icon={<HistoryOutlined />} onClick={() => setHistoryOpen(true)}>
            Riwayat versi
          </Button>
          <Button loading={save.isPending} disabled={!dirty} onClick={() => save.mutate(draft)}>
            Simpan draft
          </Button>
          <Button
            type="primary"
            disabled={!canPublish}
            title={publisherOnly}
            loading={publish.isPending}
            onClick={() =>
              Modal.confirm({
                title: `Terbitkan ${draft.name}?`,
                content:
                  'Anak yang sedang memainkan level ini menyelesaikan versi lama; sesi berikutnya memakai versi baru.',
                okText: 'Terbitkan',
                cancelText: 'Batal',
                onOk: () => publish.mutateAsync().catch(() => undefined),
              })
            }
          >
            Terbitkan
          </Button>
        </Space>
      </div>

      {missingAudio.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 16 }}
          title={`Angka ${missingAudio.join(', ')} belum punya suara yang terbit`}
          description={
            <>
              Level ini menghitung sampai {draft.range.max} sambil memutar suara tiap angka. Buka{' '}
              <Link to="/angka?tab=numbers">tab Kenal Angka</Link>, klik <b>Edit</b> pada angka itu, isi Suara (unggah
              file atau tempel URL), lalu klik <b>Terbitkan</b>. Setelah itu terbitkan level ini lagi.
            </>
          }
        />
      )}

      <Row gutter={24} style={{ marginTop: 16 }}>
        <Col xs={24} xl={15}>
          <Form layout="vertical">
            <Card title="Identitas" style={{ marginBottom: 16 }}>
              <Row gutter={16}>
                <Col xs={24} md={10}>
                  <Form.Item label="Nama level" validateStatus={status('name')} help={err('name')}>
                    <Input
                      aria-label="Nama level"
                      value={draft.name}
                      onChange={(e) => edit({ name: e.target.value })}
                    />
                  </Form.Item>
                </Col>
                <Col xs={12} md={5}>
                  <Form.Item label="Urutan" tooltip="Ubah urutan dengan menyeret baris di daftar level">
                    <InputNumber aria-label="Urutan" value={meta.sort_order} disabled style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={9}>
                  <Form.Item
                    label="Terbuka setelah"
                    validateStatus={status('prerequisite_id')}
                    help={err('prerequisite_id')}
                  >
                    <Select
                      aria-label="Terbuka setelah"
                      value={draft.prerequisite_id ?? ''}
                      onChange={(v) => edit({ prerequisite_id: v || null })}
                      options={[
                        { value: '', label: 'Tanpa syarat' },
                        ...(levels.data ?? [])
                          .filter((l) => l.id !== id)
                          .map((l) => ({ value: l.id, label: `Level ${l.sort_order} · ${l.name}` })),
                      ]}
                    />
                  </Form.Item>
                </Col>
              </Row>
              <Space size={32} wrap>
                <Space>
                  <Switch
                    aria-label="Tampil di aplikasi"
                    checked={meta.status === 'published'}
                    disabled={!canPublish}
                    title={publisherOnly}
                    loading={visibility.isPending || publish.isPending}
                    onChange={(v) => (v && meta.version == null ? publish.mutate() : visibility.mutate(v))}
                  />
                  <Text strong>Tampil di aplikasi</Text>
                </Space>
                <Space align="start">
                  <Switch
                    aria-label="Gratis untuk semua"
                    checked={meta.is_free}
                    disabled={!canPublish}
                    title={publisherOnly}
                    onChange={(v) => setFree.mutate(v)}
                  />
                  <div>
                    <Text strong>Gratis untuk semua</Text>
                    <div>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        Saat ini: {freeLevel ? `Level ${freeLevel.sort_order}` : 'belum ada'}. Hanya satu level yang
                        bisa gratis.
                      </Text>
                    </div>
                  </div>
                </Space>
              </Space>
            </Card>

            <Card
              title="Soal"
              extra={<Text type="secondary">Soal dibuat otomatis dari pengaturan ini</Text>}
              style={{ marginBottom: 16 }}
            >
              <Row gutter={16}>
                <Col xs={12} md={8}>
                  <Form.Item
                    label="Jumlah benda paling sedikit"
                    validateStatus={status('range.min')}
                    help={err('range.min')}
                  >
                    <InputNumber
                      aria-label="Jumlah benda paling sedikit"
                      min={1}
                      max={20}
                      value={draft.range.min}
                      onChange={(v) => edit({ range: { ...draft.range, min: v ?? 1 } })}
                      style={{ width: '100%' }}
                    />
                  </Form.Item>
                </Col>
                <Col xs={12} md={8}>
                  <Form.Item
                    label="Jumlah benda paling banyak"
                    validateStatus={status('range.max')}
                    help={err('range.max')}
                  >
                    <InputNumber
                      aria-label="Jumlah benda paling banyak"
                      min={1}
                      max={20}
                      value={draft.range.max}
                      onChange={(v) => edit({ range: { ...draft.range, max: v ?? 1 } })}
                      style={{ width: '100%' }}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item
                    label="Soal per level"
                    validateStatus={status('question_count')}
                    help={err('question_count')}
                  >
                    <Space.Compact style={{ width: '100%' }}>
                      <Button
                        aria-label="Kurangi soal"
                        icon={<MinusOutlined />}
                        disabled={n <= 5}
                        onClick={() => edit({ question_count: n - 1 })}
                      />
                      <InputNumber
                        aria-label="Soal per level"
                        min={5}
                        max={20}
                        controls={false}
                        value={n}
                        onChange={(v) => edit({ question_count: v ?? 10 })}
                        style={{ width: '100%', textAlign: 'center' }}
                      />
                      <Button
                        aria-label="Tambah soal"
                        icon={<PlusOutlined />}
                        disabled={n >= 20}
                        onClick={() => edit({ question_count: n + 1 })}
                      />
                    </Space.Compact>
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item
                label={
                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                    <span>Benda yang dipakai</span>
                  </div>
                }
                extra={
                  <span>
                    Satu benda per soal, dipilih acak. {draft.object_ids.length} benda dipilih. ·{' '}
                    <Link to="/angka?tab=objects" style={{ color: RUST }}>
                      Kelola pustaka benda
                    </Link>
                  </span>
                }
                validateStatus={status('object_ids')}
                help={err('object_ids')}
              >
                <Space wrap>
                  {usable.map((o, i) => {
                    const on = draft.object_ids.includes(o.id);
                    return (
                      <Button
                        key={o.id}
                        shape="round"
                        aria-pressed={on}
                        onClick={() => toggleObject(o.id)}
                        style={{
                          borderColor: on ? ANGKA_BLUE : undefined,
                          background: on ? '#EEF4FC' : undefined,
                        }}
                      >
                        <span
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: '50%',
                            display: 'inline-block',
                            background: swatch(i),
                            marginRight: 6,
                            verticalAlign: 'middle',
                          }}
                        />
                        {o.name || '—'}
                        {o.status !== 'published' && (
                          <Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>
                            ({o.status === 'draft' ? 'draft' : 'disembunyikan'})
                          </Text>
                        )}
                        {on && <CheckOutlined style={{ color: ANGKA_BLUE }} />}
                      </Button>
                    );
                  })}
                  {usable.length === 0 && <Text type="secondary">Belum ada benda di pustaka.</Text>}
                </Space>
              </Form.Item>
              <Form.Item label="Susunan gambar" validateStatus={status('layout')} help={err('layout')}>
                <Space>
                  {(
                    [
                      ['scatter', 'Tersebar'],
                      ['rows', 'Baris'],
                    ] as [AngkaLayout, string][]
                  ).map(([value, label]) => (
                    <Button
                      key={value}
                      aria-pressed={draft.layout === value}
                      onClick={() => edit({ layout: value })}
                      style={{
                        minWidth: 140,
                        height: 48,
                        borderColor: draft.layout === value ? RUST : undefined,
                        background: draft.layout === value ? '#FDF1E8' : undefined,
                      }}
                    >
                      {label}
                    </Button>
                  ))}
                </Space>
              </Form.Item>
            </Card>

            <Card
              title="Penilaian"
              extra={<Text type="secondary">Dihitung dari jawaban benar pada percobaan pertama</Text>}
              style={{ marginBottom: 16 }}
            >
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item
                    label="★★★ jika benar minimal"
                    validateStatus={status('stars.three')}
                    help={err('stars.three')}
                  >
                    <Space>
                      <InputNumber
                        aria-label="Tiga bintang jika benar minimal"
                        min={1}
                        max={20}
                        value={draft.stars.three}
                        onChange={(v) => edit({ stars: { ...draft.stars, three: v ?? 1 } })}
                      />
                      <Text type="secondary">dari {n} soal</Text>
                    </Space>
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item label="★★ jika benar minimal" validateStatus={status('stars.two')} help={err('stars.two')}>
                    <Space>
                      <InputNumber
                        aria-label="Dua bintang jika benar minimal"
                        min={1}
                        max={20}
                        value={draft.stars.two}
                        onChange={(v) => edit({ stars: { ...draft.stars, two: v ?? 1 } })}
                      />
                      <Text type="secondary">dari {n} soal</Text>
                    </Space>
                  </Form.Item>
                </Col>
              </Row>
              <Text type="secondary" style={{ fontSize: 12 }}>
                ★ satu diberikan untuk setiap level yang diselesaikan. Anak terus mencoba sampai jawabannya benar.
                Menyelesaikan level ini membuka level berikutnya.
              </Text>
            </Card>

            <Card title="Umpan balik">
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item
                    label="Judul benar"
                    validateStatus={status('feedback.success')}
                    help={err('feedback.success')}
                  >
                    <Input
                      aria-label="Judul benar"
                      value={draft.feedback.success}
                      onChange={(e) => edit({ feedback: { ...draft.feedback, success: e.target.value } })}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item label="Judul salah" validateStatus={status('feedback.retry')} help={err('feedback.retry')}>
                    <Input
                      aria-label="Judul salah"
                      value={draft.feedback.retry}
                      onChange={(e) => edit({ feedback: { ...draft.feedback, retry: e.target.value } })}
                    />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item
                label="Petunjuk saat salah"
                validateStatus={status('feedback.hint')}
                help={err('feedback.hint') ?? '{benda} diganti otomatis dengan nama benda di soal.'}
              >
                <Input.TextArea
                  aria-label="Petunjuk saat salah"
                  autoSize={{ minRows: 2 }}
                  value={draft.feedback.hint}
                  onChange={(e) => edit({ feedback: { ...draft.feedback, hint: e.target.value } })}
                />
              </Form.Item>
            </Card>
          </Form>
        </Col>
        <Col xs={24} xl={9}>
          <div style={{ position: 'sticky', top: 16 }}>
            <Card>
              <QuestionPreview levelId={id} levelNumber={meta.sort_order} draft={draft} />
            </Card>
          </div>
        </Col>
      </Row>

      <HistoryDrawer
        entityType="angka_level"
        entityId={id}
        loadVersions={() => angkaApi.levels.versions(id)}
        rollback={(v) => angkaApi.levels.rollback(id, v)}
        listQueryKey={['angka-levels']}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onRolledBack={() => void reload()}
      />
    </>
  );
}
