import { Button, Drawer, List, Modal, Tabs, Tag, Typography, message } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { hurufApi } from '../../api/huruf';
import { adminsApi } from '../../api/admins';
import { useCanPublish } from '../../store/authStore';

const { Text } = Typography;

const ACTION_LABELS: Record<string, string> = {
  'draft.save': 'Menyimpan draft',
  publish: 'Menerbitkan',
  rollback: 'Mengembalikan versi',
  hide: 'Menyembunyikan',
  unhide: 'Menampilkan',
  set_free: 'Menjadikan gratis',
  reorder: 'Mengubah urutan',
};

const when = (iso: string) => new Date(iso).toLocaleString('id-ID');

interface Props {
  letterId: string;
  open: boolean;
  onClose: () => void;
  /** Called after a rollback, so the editor reloads the draft. */
  onRolledBack: () => void;
}

/** "Riwayat versi": published versions (with rollback) and the audit log. */
export default function HistoryDrawer({ letterId, open, onClose, onRolledBack }: Props) {
  const canPublish = useCanPublish();
  const queryClient = useQueryClient();
  const versions = useQuery({
    queryKey: ['huruf-versions', letterId],
    queryFn: () => hurufApi.versions(letterId),
    enabled: open,
  });
  const activity = useQuery({
    queryKey: ['huruf-audit', letterId],
    queryFn: () => adminsApi.auditLog('letter', letterId),
    enabled: open,
  });
  const rollback = useMutation({
    mutationFn: (version: number) => hurufApi.rollback(letterId, version),
    onSuccess: (res) => {
      message.success(`Versi v${res.version} diterbitkan`);
      queryClient.invalidateQueries({ queryKey: ['huruf-versions', letterId] });
      queryClient.invalidateQueries({ queryKey: ['huruf-audit', letterId] });
      queryClient.invalidateQueries({ queryKey: ['huruf-letters'] });
      onRolledBack();
    },
    onError: () => message.error('Gagal mengembalikan versi'),
  });

  return (
    <Drawer title="Riwayat versi" open={open} onClose={onClose} size={420}>
      <Tabs
        items={[
          {
            key: 'versions',
            label: 'Versi',
            children: (
              <List
                loading={versions.isLoading}
                locale={{ emptyText: 'Belum pernah diterbitkan' }}
                dataSource={versions.data ?? []}
                renderItem={(v) => (
                  <List.Item
                    actions={
                      v.is_current
                        ? [<Tag key="live" color="green">Terbit</Tag>]
                        : [
                            <Button
                              key="restore"
                              size="small"
                              disabled={!canPublish}
                              title={canPublish ? undefined : 'Butuh peran Publisher'}
                              onClick={() =>
                                Modal.confirm({
                                  title: `Kembalikan ke v${v.version}?`,
                                  content:
                                    'Isi versi ini diterbitkan sebagai versi baru dan menggantikan draft saat ini.',
                                  okText: 'Kembalikan',
                                  cancelText: 'Batal',
                                  onOk: () => rollback.mutateAsync(v.version),
                                })
                              }
                            >
                              Kembalikan
                            </Button>,
                          ]
                    }
                  >
                    <List.Item.Meta
                      title={`v${v.version}`}
                      description={`${v.published_by} · ${when(v.published_at)}`}
                    />
                  </List.Item>
                )}
              />
            ),
          },
          {
            key: 'activity',
            label: 'Aktivitas',
            children: (
              <List
                loading={activity.isLoading}
                locale={{ emptyText: 'Belum ada aktivitas' }}
                dataSource={activity.data?.data ?? []}
                renderItem={(e) => (
                  <List.Item>
                    <List.Item.Meta
                      title={ACTION_LABELS[e.action] ?? e.action}
                      description={
                        <Text type="secondary">
                          {e.admin_email} · {when(e.created_at)}
                        </Text>
                      }
                    />
                  </List.Item>
                )}
              />
            ),
          },
        ]}
      />
    </Drawer>
  );
}
