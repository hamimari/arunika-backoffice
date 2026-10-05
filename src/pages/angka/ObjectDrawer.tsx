import { useState } from 'react';
import { Alert, Button, Drawer, Form, Input, Modal, Space, Spin, message } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { angkaApi, type AngkaObjectContent, type AngkaObjectDraft } from '../../api/angka';
import type { Asset } from '../../api/assets';
import { errorCode, validationFields } from '../../api/huruf';
import { useCanPublish } from '../../store/authStore';
import AssetField from '../../components/content/AssetField';
import StatusTag from '../../components/content/StatusTag';
import { angkaFieldErrorText, conflictText } from './angkaUtils';

interface Props {
  objectId: string | null;
  onClose: () => void;
}

/** Add or edit one library object: picture, name, question and its audio. */
export default function ObjectDrawer({ objectId, onClose }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['angka-object', objectId],
    queryFn: () => angkaApi.objects.getDraft(objectId!),
    enabled: !!objectId,
  });
  return (
    <Drawer title="Benda" open={!!objectId} onClose={onClose} size={480} destroyOnHidden>
      {isLoading || !data ? (
        <Spin style={{ display: 'block', margin: '60px auto' }} />
      ) : (
        <ObjectForm key={`${data.id}-${data.draft_rev}`} initial={data} onClose={onClose} />
      )}
    </Drawer>
  );
}

/** "Ada berapa apel?" from the name. */
const questionFor = (name: string) => (name.trim() ? `Ada berapa ${name.trim()}?` : '');

function ObjectForm({ initial, onClose }: { initial: AngkaObjectDraft; onClose: () => void }) {
  const canPublish = useCanPublish();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<AngkaObjectContent>(initial.draft);
  const [assets, setAssets] = useState<Record<string, Asset>>(initial.assets ?? {});
  const [rev, setRev] = useState(initial.draft_rev);
  const [meta, setMeta] = useState<AngkaObjectDraft>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['angka-objects'] });
    queryClient.invalidateQueries({ queryKey: ['angka-object', initial.id] });
    queryClient.invalidateQueries({ queryKey: ['angka-levels'] });
  };

  const edit = (patch: Partial<AngkaObjectContent>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
    setErrors({});
  };
  const setName = (name: string) => {
    // The question follows the name until someone writes their own.
    const auto = !draft.question_text || draft.question_text === questionFor(draft.name);
    edit(auto ? { name, question_text: questionFor(name) } : { name });
  };

  const save = async () => {
    const res = await angkaApi.objects.saveDraft(initial.id, draft, rev);
    setRev(res.draft_rev);
    setMeta(res);
    setDirty(false);
    return res;
  };
  const failed = (err: unknown) => {
    if (errorCode(err) === 'DRAFT_CONFLICT') {
      message.error('Benda diubah oleh orang lain. Tutup dan buka lagi untuk melihat versi terbaru.');
      return;
    }
    const fields = validationFields(err);
    if (fields.length) {
      setErrors(Object.fromEntries(fields.map((f) => [f.path, angkaFieldErrorText(f)])));
      message.error('Benda belum lengkap — periksa kolom yang ditandai');
      return;
    }
    message.error(conflictText(errorCode(err)) ?? 'Gagal menyimpan benda');
  };

  const saveDraft = useMutation({
    mutationFn: save,
    onSuccess: () => {
      message.success('Draft benda disimpan');
      refresh();
    },
    onError: failed,
  });
  const publish = useMutation({
    mutationFn: async () => {
      if (dirty) await save();
      await angkaApi.objects.publish(initial.id);
    },
    onSuccess: () => {
      message.success(`${draft.name} terbit`);
      refresh();
      onClose();
    },
    onError: failed,
  });
  const visibility = useMutation({
    mutationFn: (hide: boolean) => (hide ? angkaApi.objects.hide(initial.id) : angkaApi.objects.unhide(initial.id)),
    onSuccess: (_, hide) => {
      message.success(hide ? `${draft.name} disembunyikan` : `${draft.name} ditampilkan`);
      refresh();
      onClose();
    },
    onError: failed,
  });
  const remove = useMutation({
    mutationFn: () => angkaApi.objects.remove(initial.id),
    onSuccess: () => {
      message.success('Benda dihapus');
      refresh();
      onClose();
    },
    onError: failed,
  });

  const publisherOnly = canPublish ? undefined : 'Butuh peran Publisher';
  const asset = (id: string | null) => (id ? assets[id] : undefined);
  const addAsset = (a: Asset) => setAssets((m) => ({ ...m, [a.id]: a }));

  return (
    <Form layout="vertical">
      <Space style={{ marginBottom: 12 }}>
        <StatusTag item={meta} />
        <span style={{ color: '#888', fontSize: 12 }}>Dipakai di {meta.used_in} level</span>
      </Space>
      {meta.used_in > 0 && meta.status !== 'draft' && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          title="Perubahan yang diterbitkan langsung dipakai di semua level yang memakai benda ini."
        />
      )}
      <Form.Item label="Gambar" validateStatus={errors.image_asset_id || errors.image_url ? 'error' : undefined}>
        <AssetField
          kind="image"
          label="Gambar benda"
          hint="PNG/WebP latar transparan, maks. 300 KB"
          placeholder="https://media.haloarunika.com/angka/apel.png"
          asset={asset(draft.image_asset_id)}
          url={draft.image_url}
          error={errors.image_asset_id ?? errors.image_url}
          onUploaded={(a) => {
            addAsset(a);
            edit({ image_asset_id: a.id, image_url: '' });
          }}
          onUrlChange={(u) => edit({ image_asset_id: null, image_url: u })}
          onRemove={() => edit({ image_asset_id: null })}
        />
      </Form.Item>
      <Form.Item label="Nama" validateStatus={errors.name ? 'error' : undefined} help={errors.name}>
        <Input
          aria-label="Nama benda"
          placeholder="apel"
          value={draft.name}
          onChange={(e) => setName(e.target.value)}
        />
      </Form.Item>
      <Form.Item
        label="Teks pertanyaan"
        validateStatus={errors.question_text ? 'error' : undefined}
        help={errors.question_text}
      >
        <Input
          aria-label="Teks pertanyaan"
          placeholder="Ada berapa apel?"
          value={draft.question_text}
          onChange={(e) => edit({ question_text: e.target.value })}
        />
      </Form.Item>
      <Form.Item label="Suara pertanyaan">
        <AssetField
          kind="audio"
          label="Suara pertanyaan"
          hint="MP3 atau AAC · maks. 5 detik"
          placeholder="https://media.haloarunika.com/angka/ada-berapa-apel.mp3"
          asset={asset(draft.question_audio_id)}
          url={draft.question_audio_url}
          error={errors.question_audio_id ?? errors.question_audio_url}
          onUploaded={(a) => {
            addAsset(a);
            edit({ question_audio_id: a.id, question_audio_url: '' });
          }}
          onUrlChange={(u) => edit({ question_audio_id: null, question_audio_url: u })}
        />
      </Form.Item>
      <Space wrap>
        <Button loading={saveDraft.isPending} disabled={!dirty} onClick={() => saveDraft.mutate()}>
          Simpan draft
        </Button>
        <Button
          type="primary"
          disabled={!canPublish}
          title={publisherOnly}
          loading={publish.isPending}
          onClick={() => publish.mutate()}
        >
          Terbitkan
        </Button>
        {meta.status === 'hidden' ? (
          <Button disabled={!canPublish} title={publisherOnly} onClick={() => visibility.mutate(false)}>
            Tampilkan
          </Button>
        ) : (
          <Button
            disabled={!canPublish || meta.status === 'draft'}
            title={publisherOnly}
            onClick={() => visibility.mutate(true)}
          >
            Sembunyikan
          </Button>
        )}
        <Button
          danger
          disabled={!canPublish}
          title={publisherOnly}
          onClick={() =>
            Modal.confirm({
              title: `Hapus ${draft.name || 'benda ini'}?`,
              content: 'Benda yang tidak dipakai level mana pun dihapus permanen.',
              okText: 'Hapus',
              okButtonProps: { danger: true },
              cancelText: 'Batal',
              onOk: () => remove.mutateAsync().catch(() => undefined),
            })
          }
        >
          Hapus
        </Button>
      </Space>
    </Form>
  );
}
