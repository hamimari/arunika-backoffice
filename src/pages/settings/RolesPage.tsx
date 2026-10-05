import { Alert, Select, Table, Typography, message } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';
import { adminsApi, type AdminAccount } from '../../api/admins';
import type { AdminRole } from '../../api/auth';
import { errorCode } from '../../api/huruf';
import { useCanPublish } from '../../store/authStore';

const { Paragraph } = Typography;

/** "Pengaturan & peran": who may only edit drafts and who may publish. */
export default function RolesPage() {
  const canPublish = useCanPublish();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['admins'], queryFn: adminsApi.list });

  const setRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: AdminRole }) => adminsApi.setRole(id, role),
    onSuccess: (a) => {
      message.success(`${a.email} sekarang ${a.role === 'publisher' ? 'Publisher' : 'Editor'}`);
      queryClient.invalidateQueries({ queryKey: ['admins'] });
    },
    onError: (err) =>
      message.error(
        errorCode(err) === 'LAST_PUBLISHER'
          ? 'Minimal harus ada satu Publisher'
          : 'Gagal mengubah peran',
      ),
  });

  const columns: ColumnsType<AdminAccount> = [
    { title: 'Email', dataIndex: 'email', key: 'email' },
    {
      title: 'Peran',
      key: 'role',
      width: 200,
      render: (_: unknown, a: AdminAccount) => (
        <Select<AdminRole>
          aria-label={`Peran ${a.email}`}
          value={a.role}
          disabled={!canPublish}
          style={{ width: 160 }}
          onChange={(role) => setRole.mutate({ id: a.id, role })}
          options={[
            { value: 'editor', label: 'Editor' },
            { value: 'publisher', label: 'Publisher' },
          ]}
        />
      ),
    },
  ];

  return (
    <>
      <h2>Pengaturan &amp; peran</h2>
      <Paragraph type="secondary">
        Editor bisa mengubah draft dan mengunggah file. Publisher juga bisa menerbitkan,
        menyembunyikan, mengubah urutan, mengembalikan versi, dan mengatur peran.
      </Paragraph>
      {!canPublish && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          title="Hanya Publisher yang bisa mengubah peran."
        />
      )}
      <Table rowKey="id" columns={columns} dataSource={data ?? []} loading={isLoading} pagination={false} />
    </>
  );
}
