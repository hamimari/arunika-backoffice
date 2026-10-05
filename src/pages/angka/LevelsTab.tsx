import { useState } from 'react';
import { Alert, Button, Card, Dropdown, Modal, Space, Table, Tag, Typography, message } from 'antd';
import { HolderOutlined, MoreOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import { angkaApi, type AngkaLevelRow, type AngkaObjectRow } from '../../api/angka';
import { errorCode } from '../../api/huruf';
import { mediaUrl } from '../../api/client';
import { useCanPublish } from '../../store/authStore';
import StatusTag from '../../components/content/StatusTag';
import { ANGKA_BLUE, conflictText, swatch } from './angkaUtils';

const { Text } = Typography;

interface Props {
  levels: AngkaLevelRow[];
  objects: AngkaObjectRow[];
  loading: boolean;
  onManageObjects: () => void;
}

/** The Hitung Benda levels table and the object library summary. */
export default function LevelsTab({ levels, objects, loading, onManageObjects }: Props) {
  const navigate = useNavigate();
  const canPublish = useCanPublish();
  const queryClient = useQueryClient();
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['angka-levels'] });

  const reorder = useMutation({
    mutationFn: (rows: AngkaLevelRow[]) => angkaApi.levels.reorder(rows.map((r) => r.id)),
    onSuccess: () => {
      message.success('Urutan level disimpan');
      void refresh();
    },
    onError: () => message.error('Gagal menyimpan urutan'),
  });

  const action = useMutation({
    mutationFn: ({ run }: { run: () => Promise<unknown>; done: string }) => run(),
    onSuccess: (_, { done }) => {
      message.success(done);
      void refresh();
    },
    onError: (err) => message.error(conflictText(errorCode(err)) ?? 'Gagal menyimpan perubahan'),
  });

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= levels.length) return;
    const next = [...levels];
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    reorder.mutate(next);
  };

  const menu = (l: AngkaLevelRow) => ({
    items: [
      l.status === 'hidden'
        ? { key: 'unhide', label: 'Tampilkan' }
        : { key: 'hide', label: 'Sembunyikan', disabled: l.version == null },
      l.is_free ? { key: 'unset-free', label: 'Hapus gratis' } : { key: 'set-free', label: 'Jadikan gratis' },
      { key: 'delete', label: 'Hapus', danger: true, disabled: l.version != null },
    ],
    onClick: ({ key }: { key: string }) => {
      const run = {
        hide: { run: () => angkaApi.levels.hide(l.id), done: `${l.name} disembunyikan` },
        unhide: { run: () => angkaApi.levels.unhide(l.id), done: `${l.name} ditampilkan` },
        'set-free': { run: () => angkaApi.levels.setFree(l.id), done: `${l.name} sekarang gratis untuk semua` },
        'unset-free': { run: () => angkaApi.levels.unsetFree(l.id), done: `${l.name} sekarang butuh Akses Premium` },
        delete: { run: () => angkaApi.levels.remove(l.id), done: `${l.name} dihapus` },
      }[key];
      if (!run) return;
      if (key === 'delete') {
        Modal.confirm({
          title: `Hapus ${l.name}?`,
          content: 'Level yang belum pernah terbit dihapus permanen.',
          okText: 'Hapus',
          okButtonProps: { danger: true },
          cancelText: 'Batal',
          onOk: () => action.mutateAsync(run).catch(() => undefined),
        });
        return;
      }
      action.mutate(run);
    },
  });

  const columns: ColumnsType<AngkaLevelRow> = [
    {
      title: '',
      key: 'drag',
      width: 36,
      render: () => (
        <HolderOutlined style={{ color: canPublish ? '#999' : '#ddd', cursor: canPublish ? 'grab' : 'default' }} />
      ),
    },
    {
      title: 'Urutan',
      key: 'order',
      width: 80,
      render: (_: unknown, l: AngkaLevelRow) => (
        <span
          style={{
            display: 'inline-flex',
            width: 36,
            height: 36,
            borderRadius: 8,
            background: '#E3EDFB',
            color: ANGKA_BLUE,
            fontWeight: 700,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {l.sort_order}
        </span>
      ),
    },
    {
      title: 'Nama level',
      key: 'name',
      render: (_: unknown, l: AngkaLevelRow) => (
        <div>
          <Space size={6}>
            <Text strong>{l.name || '—'}</Text>
            {l.is_free && <Tag color="green">Gratis</Tag>}
          </Space>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {l.prerequisite_sort_order ? `Setelah Level ${l.prerequisite_sort_order}` : 'Tanpa syarat'}
            </Text>
          </div>
        </div>
      ),
    },
    {
      title: 'Rentang',
      key: 'range',
      width: 90,
      render: (_: unknown, l: AngkaLevelRow) => <Text strong>{`${l.range.min}–${l.range.max}`}</Text>,
    },
    { title: 'Soal', key: 'questions', width: 70, render: (_: unknown, l: AngkaLevelRow) => l.question_count },
    {
      title: 'Benda',
      key: 'objects',
      render: (_: unknown, l: AngkaLevelRow) => l.object_names.join(', ') || <Text type="secondary">—</Text>,
    },
    {
      title: 'Bintang (benar pertama)',
      key: 'stars',
      width: 150,
      render: (_: unknown, l: AngkaLevelRow) => (
        <div style={{ fontSize: 12, lineHeight: 1.6 }}>
          <div>★★★ ≥ {l.stars.three}</div>
          <div>★★ ≥ {l.stars.two}</div>
        </div>
      ),
    },
    { title: 'Status', key: 'status', width: 130, render: (_: unknown, l: AngkaLevelRow) => <StatusTag item={l} /> },
    {
      title: 'Versi',
      key: 'version',
      width: 70,
      render: (_: unknown, l: AngkaLevelRow) => (l.version ? `v${l.version}` : '—'),
    },
    {
      title: 'Aksi',
      key: 'action',
      width: 110,
      render: (_: unknown, l: AngkaLevelRow) => (
        <Space>
          <Button size="small" onClick={() => navigate(`/angka/levels/${l.id}`)}>
            Edit
          </Button>
          <Dropdown menu={menu(l)} disabled={!canPublish} trigger={['click']}>
            <Button
              size="small"
              icon={<MoreOutlined />}
              aria-label={`Aksi lain ${l.name}`}
              title={canPublish ? undefined : 'Butuh peran Publisher'}
            />
          </Dropdown>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        title="Soal dibuat otomatis dari rentang angka dan benda di tiap level. Satu level bertanda Gratis bisa dimainkan tanpa Akses Premium."
      />
      <Table
        rowKey="id"
        columns={columns}
        dataSource={levels}
        loading={loading || reorder.isPending}
        pagination={false}
        onRow={(_, index) =>
          canPublish
            ? {
                draggable: true,
                onDragStart: () => setDragFrom(index ?? null),
                onDragOver: (e) => e.preventDefault(),
                onDrop: () => {
                  if (dragFrom !== null && index !== undefined) move(dragFrom, index);
                  setDragFrom(null);
                },
              }
            : {}
        }
      />
      <Card
        style={{ marginTop: 20 }}
        title={
          <div>
            <div>Pustaka benda</div>
            <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
              Benda yang bisa dipakai di soal. Tiap benda punya gambar, teks pertanyaan, dan suara pertanyaan.
            </Text>
          </div>
        }
        extra={<Button onClick={onManageObjects}>Kelola pustaka</Button>}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
          {objects.map((o, i) => (
            <div key={o.id} style={{ border: '1px solid #eee', borderRadius: 12, padding: 10 }}>
              <div
                style={{
                  height: 56,
                  borderRadius: 8,
                  background: swatch(i),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {o.image_url && <img src={mediaUrl(o.image_url)} alt="" height={48} />}
              </div>
              <Text strong style={{ display: 'block', marginTop: 8 }}>
                {o.name || '—'}
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Dipakai di {o.used_in} level
              </Text>
            </div>
          ))}
          {objects.length === 0 && <Text type="secondary">Belum ada benda.</Text>}
        </div>
      </Card>
    </>
  );
}
