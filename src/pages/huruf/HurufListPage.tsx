import { useMemo, useState } from 'react';
import { Alert, Button, Input, Space, Table, Tabs, Tag, Typography, message } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, HolderOutlined, SwapOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import { hurufApi, type HurufLetterRow } from '../../api/huruf';
import { useCanPublish } from '../../store/authStore';
import { statusGroup, type StatusFilter } from './hurufUtils';
import StatusTag from '../../components/content/StatusTag';
import { mediaUrl } from '../../api/client';

const { Text, Paragraph } = Typography;

/** "Konten Belajar › Huruf": the 26 letters, their status and order. */
export default function HurufListPage() {
  const navigate = useNavigate();
  const canPublish = useCanPublish();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [ordering, setOrdering] = useState<HurufLetterRow[] | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ['huruf-letters'], queryFn: hurufApi.list });
  const letters = useMemo(() => data ?? [], [data]);

  const counts = useMemo(() => {
    const c = { all: letters.length, published: 0, draft: 0, hidden: 0 };
    for (const l of letters) c[statusGroup(l)]++;
    return c;
  }, [letters]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return letters.filter(
      (l) =>
        (filter === 'all' || statusGroup(l) === filter) &&
        (!q || l.upper.toLowerCase() === q || l.word.toLowerCase().includes(q)),
    );
  }, [letters, filter, search]);

  const saveOrder = useMutation({
    mutationFn: (rows: HurufLetterRow[]) => hurufApi.reorder(rows.map((r) => r.id)),
    onSuccess: () => {
      message.success('Urutan huruf disimpan');
      setOrdering(null);
      queryClient.invalidateQueries({ queryKey: ['huruf-letters'] });
    },
    onError: () => message.error('Gagal menyimpan urutan'),
  });

  const moveRow = (from: number, to: number) => {
    if (!ordering || to < 0 || to >= ordering.length || from === to) return;
    const next = [...ordering];
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    setOrdering(next);
  };

  const when = (iso: string) =>
    new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

  const columns: ColumnsType<HurufLetterRow> = [
    {
      title: 'No.',
      key: 'order',
      width: 70,
      render: (_: unknown, l: HurufLetterRow, i: number) =>
        ordering ? (
          <Space size={2}>
            <HolderOutlined />
            <Button
              size="small"
              type="text"
              aria-label={`Naikkan ${l.upper}`}
              icon={<ArrowUpOutlined />}
              onClick={() => moveRow(i, i - 1)}
            />
            <Button
              size="small"
              type="text"
              aria-label={`Turunkan ${l.upper}`}
              icon={<ArrowDownOutlined />}
              onClick={() => moveRow(i, i + 1)}
            />
          </Space>
        ) : (
          l.sort_order
        ),
    },
    {
      title: 'Huruf',
      key: 'letter',
      width: 80,
      render: (_: unknown, l: HurufLetterRow) => (
        <Text strong style={{ fontSize: 18 }}>
          {l.upper}
          {l.lower}
        </Text>
      ),
    },
    {
      title: 'Kata contoh',
      key: 'word',
      render: (_: unknown, l: HurufLetterRow) => (
        <Space>
          {l.image_url ? (
            <img src={mediaUrl(l.image_url)} alt="" width={32} height={32} style={{ borderRadius: 6 }} />
          ) : (
            <span style={{ width: 32, height: 32, display: 'inline-block', background: '#f3efe9', borderRadius: 6 }} />
          )}
          <span>{l.word || <Text type="secondary">—</Text>}</span>
          {l.is_free && <Tag color="green">Gratis</Tag>}
        </Space>
      ),
    },
    { title: 'Suara', key: 'audio', width: 80, render: (_: unknown, l: HurufLetterRow) => `${l.audio_count}/2` },
    {
      title: 'Tebalkan',
      key: 'strokes',
      width: 100,
      render: (_: unknown, l: HurufLetterRow) => `${l.stroke_count} garis`,
    },
    { title: 'Status', key: 'status', width: 140, render: (_: unknown, l: HurufLetterRow) => <StatusTag item={l} /> },
    {
      title: 'Versi',
      key: 'version',
      width: 70,
      render: (_: unknown, l: HurufLetterRow) => (l.version ? `v${l.version}` : '—'),
    },
    {
      title: 'Terakhir diubah',
      key: 'updated',
      width: 170,
      render: (_: unknown, l: HurufLetterRow) => (
        <>
          <div>{when(l.updated_at)}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {l.updated_by || '—'}
          </Text>
        </>
      ),
    },
    {
      title: 'Aksi',
      key: 'action',
      width: 80,
      render: (_: unknown, l: HurufLetterRow) => (
        <Button size="small" disabled={!!ordering} onClick={() => navigate(`/huruf/${l.id}`)}>
          Edit
        </Button>
      ),
    },
  ];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div>
          <Text type="secondary">Konten Belajar / Huruf</Text>
          <h2 style={{ margin: '4px 0' }}>Belajar Huruf</h2>
          <Paragraph type="secondary">
            Atur 26 huruf, kata contoh, suara, dan garis tebalkan yang tampil di aplikasi.
          </Paragraph>
        </div>
        {ordering ? (
          <Space>
            <Button onClick={() => setOrdering(null)}>Batal</Button>
            <Button type="primary" loading={saveOrder.isPending} onClick={() => saveOrder.mutate(ordering)}>
              Simpan urutan
            </Button>
          </Space>
        ) : (
          <Button
            icon={<SwapOutlined />}
            disabled={!canPublish || letters.length === 0}
            title={canPublish ? undefined : 'Butuh peran Publisher'}
            onClick={() => setOrdering([...letters])}
          >
            Ubah urutan
          </Button>
        )}
      </div>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        title="Perubahan yang diterbitkan tampil di aplikasi dalam ±15 menit. Satu huruf bertanda Gratis bisa dibuka semua orang; huruf lain butuh Akses Premium."
      />
      {!ordering && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <Tabs
            activeKey={filter}
            onChange={(k) => setFilter(k as StatusFilter)}
            items={[
              { key: 'all', label: `Semua · ${counts.all}` },
              { key: 'published', label: `Terbit · ${counts.published}` },
              { key: 'draft', label: `Draft · ${counts.draft}` },
              { key: 'hidden', label: `Disembunyikan · ${counts.hidden}` },
            ]}
          />
          <Input.Search
            allowClear
            placeholder="Cari huruf atau kata"
            style={{ maxWidth: 260 }}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}
      <Table
        rowKey="id"
        columns={columns}
        dataSource={ordering ?? visible}
        loading={isLoading}
        pagination={ordering ? false : { pageSize: 10, showTotal: (t, [a, b]) => `Menampilkan ${a}–${b} dari ${t} huruf` }}
        onRow={(_, index) =>
          ordering
            ? {
                draggable: true,
                onDragStart: () => setDragFrom(index ?? null),
                onDragOver: (e) => e.preventDefault(),
                onDrop: () => {
                  if (dragFrom !== null && index !== undefined) moveRow(dragFrom, index);
                  setDragFrom(null);
                },
              }
            : {}
        }
      />
    </>
  );
}
