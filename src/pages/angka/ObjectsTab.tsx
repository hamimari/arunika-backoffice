import { useState } from 'react';
import { Button, Typography, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { angkaApi, type AngkaObjectRow } from '../../api/angka';
import { mediaUrl } from '../../api/client';
import StatusTag from '../../components/content/StatusTag';
import ObjectDrawer from './ObjectDrawer';
import { swatch } from './angkaUtils';

const { Text, Paragraph } = Typography;

/** "Pustaka benda": every object as a card; a drawer adds and edits them. */
export default function ObjectsTab({ objects, loading }: { objects: AngkaObjectRow[]; loading: boolean }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => angkaApi.objects.create(),
    onSuccess: (o) => {
      queryClient.invalidateQueries({ queryKey: ['angka-objects'] });
      setEditing(o.id);
    },
    onError: () => message.error('Gagal menambah benda'),
  });

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
        <Paragraph type="secondary" style={{ margin: 0 }}>
          Benda yang bisa dipakai di soal. Tiap benda punya gambar berlatar transparan, teks pertanyaan, dan suara
          pertanyaan. Benda yang dipakai level hanya bisa disembunyikan, tidak dihapus.
        </Paragraph>
        <Button icon={<PlusOutlined />} loading={create.isPending} onClick={() => create.mutate()}>
          Tambah benda
        </Button>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: 14,
          marginTop: 16,
          opacity: loading ? 0.5 : 1,
        }}
      >
        {objects.map((o, i) => (
          <button
            key={o.id}
            type="button"
            aria-label={`Edit ${o.name || 'benda tanpa nama'}`}
            onClick={() => setEditing(o.id)}
            style={{
              textAlign: 'left',
              border: '1px solid #eee',
              borderRadius: 14,
              padding: 12,
              background: '#fff',
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                height: 96,
                borderRadius: 10,
                background: swatch(i),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {o.image_url ? (
                <img src={mediaUrl(o.image_url)} alt="" height={80} />
              ) : (
                <Text type="secondary">Belum ada gambar</Text>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
              <Text strong>{o.name || '—'}</Text>
              <StatusTag item={o} />
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Dipakai di {o.used_in} level
            </Text>
          </button>
        ))}
      </div>
      {!loading && objects.length === 0 && (
        <Text type="secondary" style={{ display: 'block', marginTop: 16 }}>
          Belum ada benda. Tambahkan benda pertama, misalnya apel.
        </Text>
      )}
      <ObjectDrawer objectId={editing} onClose={() => setEditing(null)} />
    </>
  );
}
