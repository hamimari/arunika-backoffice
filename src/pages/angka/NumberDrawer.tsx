import { useState } from 'react';
import { Button, Drawer, Form, Input, Select, Space, message } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { angkaApi, type AngkaNumberContent, type AngkaNumberRow, type AngkaObjectRow } from '../../api/angka';
import type { Asset } from '../../api/assets';
import { errorCode, validationFields } from '../../api/huruf';
import { useCanPublish } from '../../store/authStore';
import AssetField from '../../components/content/AssetField';
import { angkaFieldErrorText } from './angkaUtils';

interface Props {
  number: AngkaNumberRow | null;
  objects: AngkaObjectRow[];
  onClose: () => void;
}

/** Edit one Kenal Angka number: its name, audio and the object on its card. */
export default function NumberDrawer({ number, objects, onClose }: Props) {
  return (
    <Drawer
      title={number ? `Angka ${number.value}` : 'Angka'}
      open={!!number}
      onClose={onClose}
      size={440}
      destroyOnHidden
    >
      {number && (
        <NumberForm key={`${number.value}-${number.draft_rev}`} initial={number} objects={objects} onClose={onClose} />
      )}
    </Drawer>
  );
}

function NumberForm({
  initial,
  objects,
  onClose,
}: {
  initial: AngkaNumberRow;
  objects: AngkaObjectRow[];
  onClose: () => void;
}) {
  const canPublish = useCanPublish();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<AngkaNumberContent>(initial.draft);
  const [assets, setAssets] = useState<Record<string, Asset>>(initial.assets ?? {});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [rev, setRev] = useState(initial.draft_rev);

  const edit = (patch: Partial<AngkaNumberContent>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setErrors({});
  };

  const failed = (err: unknown) => {
    const fields = validationFields(err);
    if (fields.length) {
      setErrors(Object.fromEntries(fields.map((f) => [f.path, angkaFieldErrorText(f)])));
      message.error('Angka belum lengkap — periksa kolom yang ditandai');
      return;
    }
    message.error(errorCode(err) === 'DRAFT_CONFLICT' ? 'Angka diubah oleh orang lain' : 'Gagal menyimpan angka');
  };

  const save = useMutation({
    mutationFn: async (thenPublish: boolean) => {
      const res = await angkaApi.numbers.saveDraft(initial.value, draft, rev);
      setRev(res.draft_rev);
      if (thenPublish) await angkaApi.numbers.publish(initial.value);
    },
    onSuccess: (_, thenPublish) => {
      message.success(thenPublish ? `Angka ${initial.value} terbit` : 'Draft angka disimpan');
      queryClient.invalidateQueries({ queryKey: ['angka-numbers'] });
      onClose();
    },
    onError: failed,
  });

  const pickable = objects.filter((o) => o.status !== 'hidden' || o.id === draft.object_id);
  return (
    <Form layout="vertical">
      <Form.Item label="Nama" validateStatus={errors.name ? 'error' : undefined} help={errors.name}>
        <Input aria-label="Nama angka" value={draft.name} onChange={(e) => edit({ name: e.target.value })} />
      </Form.Item>
      <Form.Item label="Suara">
        <AssetField
          kind="audio"
          label={`Suara "${draft.name || initial.value}"`}
          placeholder={`https://media.haloarunika.com/angka/${initial.value}.mp3`}
          asset={draft.audio_asset_id ? assets[draft.audio_asset_id] : undefined}
          url={draft.audio_url}
          error={errors.audio_asset_id ?? errors.audio_url}
          onUploaded={(a) => {
            setAssets((m) => ({ ...m, [a.id]: a }));
            edit({ audio_asset_id: a.id, audio_url: '' });
          }}
          onUrlChange={(u) => edit({ audio_asset_id: null, audio_url: u })}
        />
      </Form.Item>
      <Form.Item
        label="Benda di kartu"
        validateStatus={errors.object_id ? 'error' : undefined}
        help={errors.object_id ?? `Kartu menampilkan ${initial.value} benda ini.`}
      >
        <Select
          aria-label="Benda di kartu"
          allowClear
          placeholder="Pilih benda"
          value={draft.object_id ?? undefined}
          onChange={(v) => edit({ object_id: v ?? null })}
          options={pickable.map((o) => ({
            value: o.id,
            label:
              o.status === 'published' ? o.name : `${o.name} (${o.status === 'draft' ? 'draft' : 'disembunyikan'})`,
          }))}
        />
      </Form.Item>
      <Space>
        <Button loading={save.isPending && !save.variables} onClick={() => save.mutate(false)}>
          Simpan draft
        </Button>
        <Button
          type="primary"
          disabled={!canPublish}
          title={canPublish ? undefined : 'Butuh peran Publisher'}
          loading={save.isPending && !!save.variables}
          onClick={() => save.mutate(true)}
        >
          Terbitkan
        </Button>
      </Space>
    </Form>
  );
}
