import { Button, Drawer, List, Modal, Tabs, Tag, Typography, message } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminsApi } from '../../api/admins';
import { useCanPublish } from '../../store/authStore';
import type { ContentVersion } from './contentUtils';

const { Text } = Typography;

const ACTION_LABELS: Record<string, string> = {
  'draft.save': 'Menyimpan draft',
  publish: 'Menerbitkan',
  rollback: 'Mengembalikan versi',
  hide: 'Menyembunyikan',
  unhide: 'Menampilkan',
  set_free: 'Menjadikan gratis',
  unset_free: 'Menjadikan premium',
  reorder: 'Mengubah urutan',
  delete: 'Menghapus',
};


const when = (iso: string) => new Date(iso).toLocaleString('id-ID');

interface Props {
  /** The audit log's entity type, e.g. "letter" or "angka_level". */
  entityType: string;
  entityId: string;
  loadVersions: () => Promise<ContentVersion[]>;
  rollback: (version: number) => Promise<{ version: number }>;
  /** The list query to refresh after a rollback. */
  listQueryKey: string[];
  open: boolean;
  onClose: () => void;
  /** Called after a rollback, so the editor reloads the draft. */
  onRolledBack: () => void;
}

/** "Riwayat versi": published versions (with rollback) and the audit log. */
export default function HistoryDrawer({
  entityType,
  entityId,
  loadVersions,
  rollback: rollbackTo,
  listQueryKey,
  open,
  onClose,
  onRolledBack,
}: Props) {
  const canPublish = useCanPublish();
  const queryClient = useQueryClient();
  const versionsKey = ['versions', entityType, entityId];
  const auditKey = ['audit', entityType, entityId];
  const versions = useQuery({
    queryKey: versionsKey,
    queryFn: loadVersions,
    enabled: open,
  });
  const activity = useQuery({
    queryKey: auditKey,
    queryFn: () => adminsApi.auditLog(entityType, entityId),
    enabled: open,
  });
  const rollback = useMutation({
    mutationFn: rollbackTo,
    onSuccess: (res) => {
      message.success(`Versi v${res.version} diterbitkan`);
      queryClient.invalidateQueries({ queryKey: versionsKey });
      queryClient.invalidateQueries({ queryKey: auditKey });
      queryClient.invalidateQueries({ queryKey: listQueryKey });
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
