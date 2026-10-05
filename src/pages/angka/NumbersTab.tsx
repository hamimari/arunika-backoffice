import { useRef, useState } from 'react';
import { Button, Switch, Table, Typography, message } from 'antd';
import { PlayCircleFilled, SoundOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';
import { angkaApi, type AngkaNumberRow, type AngkaObjectRow } from '../../api/angka';
import { errorCode, validationFields } from '../../api/huruf';
import { mediaUrl } from '../../api/client';
import { useCanPublish } from '../../store/authStore';
import StatusTag from '../../components/content/StatusTag';
import NumberDrawer from './NumberDrawer';
import { ANGKA_BLUE, angkaFieldErrorText } from './angkaUtils';

const { Text, Paragraph } = Typography;

interface Props {
  numbers: AngkaNumberRow[];
  objects: AngkaObjectRow[];
  loading: boolean;
}

/** "Kenal Angka": numbers 1–20 with their audio, object, free flag and
 *  visibility. "Tampil di aplikasi" publishes, hides or unhides. */
export default function NumbersTab({ numbers, objects, loading }: Props) {
  const canPublish = useCanPublish();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<AngkaNumberRow | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['angka-numbers'] });

  const failed = (err: unknown, n: AngkaNumberRow) => {
    const fields = validationFields(err);
    if (fields.length) {
      message.error(`Angka ${n.value} belum lengkap: ${fields.map(angkaFieldErrorText).join(', ')}`);
      return;
    }
    message.error(errorCode(err) === 'DRAFT_CONFLICT' ? 'Angka diubah oleh orang lain' : 'Gagal menyimpan angka');
  };

  const show = useMutation({
    mutationFn: ({ n, on }: { n: AngkaNumberRow; on: boolean }) => {
      if (!on) return angkaApi.numbers.hide(n.value);
      return n.status === 'hidden' ? angkaApi.numbers.unhide(n.value) : angkaApi.numbers.publish(n.value);
    },
    onSuccess: (_, { n, on }) => {
      message.success(on ? `Angka ${n.value} tampil di aplikasi` : `Angka ${n.value} disembunyikan`);
      void refresh();
    },
    onError: (err, { n }) => failed(err, n),
  });

  const free = useMutation({
    mutationFn: ({ n, on }: { n: AngkaNumberRow; on: boolean }) =>
      on ? angkaApi.numbers.setFree(n.value) : angkaApi.numbers.unsetFree(n.value),
    onSuccess: () => void refresh(),
    onError: (err, { n }) => failed(err, n),
  });

  const play = (url: string) => {
    audio.current?.pause();
    audio.current = new Audio(mediaUrl(url));
    void audio.current.play().catch(() => undefined);
  };

  const publisherOnly = canPublish ? undefined : 'Butuh peran Publisher';
  const columns: ColumnsType<AngkaNumberRow> = [
    {
      title: 'Angka',
      key: 'value',
      width: 80,
      render: (_: unknown, n: AngkaNumberRow) => (
        <Text strong style={{ fontSize: 22, color: ANGKA_BLUE }}>
          {n.value}
        </Text>
      ),
    },
    { title: 'Nama', key: 'name', render: (_: unknown, n: AngkaNumberRow) => n.name || '—' },
    {
      title: 'Suara',
      key: 'audio',
      width: 130,
      render: (_: unknown, n: AngkaNumberRow) =>
        n.audio_url ? (
          <Button
            shape="circle"
            type="text"
            aria-label={`Putar angka ${n.value}`}
            icon={<PlayCircleFilled style={{ color: ANGKA_BLUE }} />}
            onClick={() => play(n.audio_url)}
          />
        ) : (
          <Button size="small" type="dashed" icon={<SoundOutlined />} onClick={() => setEditing(n)}>
            Tambah suara
          </Button>
        ),
    },
    {
      title: 'Benda',
      key: 'object',
      render: (_: unknown, n: AngkaNumberRow) =>
        n.object_id ? (
          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            {n.object_image_url && <img src={mediaUrl(n.object_image_url)} alt="" width={28} height={28} />}
            {n.object_name}
          </span>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: 'Gratis',
      key: 'free',
      width: 90,
      render: (_: unknown, n: AngkaNumberRow) => (
        <Switch
          size="small"
          aria-label={`Gratis angka ${n.value}`}
          checked={n.is_free}
          disabled={!canPublish}
          title={publisherOnly}
          onChange={(on) => free.mutate({ n, on })}
        />
      ),
    },
    {
      title: 'Tampil di aplikasi',
      key: 'shown',
      width: 140,
      render: (_: unknown, n: AngkaNumberRow) => (
        <Switch
          size="small"
          aria-label={`Tampilkan angka ${n.value}`}
          checked={n.status === 'published'}
          disabled={!canPublish}
          title={publisherOnly}
          loading={show.isPending && show.variables?.n.value === n.value}
          onChange={(on) => {
            if (on && !n.audio_url) {
              message.info(`Isi suara angka ${n.value} dulu, lalu klik Terbitkan`);
              setEditing(n);
              return;
            }
            show.mutate({ n, on });
          }}
        />
      ),
    },
    { title: 'Status', key: 'status', width: 130, render: (_: unknown, n: AngkaNumberRow) => <StatusTag item={n} /> },
    {
      title: 'Aksi',
      key: 'action',
      width: 80,
      render: (_: unknown, n: AngkaNumberRow) => (
        <Button size="small" onClick={() => setEditing(n)}>
          Edit
        </Button>
      ),
    },
  ];

  return (
    <>
      <Paragraph type="secondary">
        Isi suara lewat <b>Tambah suara</b> atau <b>Edit</b>, lalu <b>Terbitkan</b>. Suara tiap angka juga dipakai untuk
        menghitung bersama di level, jadi terbitkan suara semua angka sampai jumlah paling banyak di level. Angka yang
        disembunyikan tidak tampil di kartu Kenal Angka, tapi suaranya tetap dipakai.
      </Paragraph>
      <Table rowKey="value" columns={columns} dataSource={numbers} loading={loading} pagination={false} size="middle" />
      <NumberDrawer number={editing} objects={objects} onClose={() => setEditing(null)} />
    </>
  );
}
