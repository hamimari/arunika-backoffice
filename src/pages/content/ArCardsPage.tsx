import { Modal, Form, Input, Select, message } from 'antd';
import ContentTable from '../../components/ContentTable';
import AccessCell from '../../components/AccessCell';
import AccessField from '../../components/AccessField';
import { arCardsApi } from '../../api/content';
import { useContentPage } from '../../hooks/useContentPage';
import type { ColumnsType } from 'antd/es/table';
import type { Access } from '../../components/AccessCell';

interface ArCard {
  id: string;
  title: string;
  type: string;
  file_url: string;
  short_code: string;
  hidden?: boolean;
  is_free?: boolean;
  access?: Access;
  price_idr?: number | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

const tableColumns: ColumnsType<ArCard> = [
  { title: 'Title', dataIndex: 'title', key: 'title' },
  { title: 'Type', dataIndex: 'type', key: 'type' },
  { title: 'Short Code', dataIndex: 'short_code', key: 'short_code' },
  { title: 'Access', key: 'access', render: (_, r) => <AccessCell item={r} /> },
  { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true },
];

export default function ArCardsPage() {
  const ctx = useContentPage('ar-cards', arCardsApi);
  const [form] = Form.useForm();

  const handleSave = async () => {
    const values = await form.validateFields();
    // Saving a card never changes its access (the backend ignores is_free on
    // update), so a changed Access is applied through its own endpoint first.
    const item = ctx.editItem as ArCard | null;
    if (item?.id && values.is_free !== item.is_free) {
      try {
        await arCardsApi.setFree(item.id, values.is_free);
      } catch {
        message.error('Failed to change access');
        return;
      }
    }
    ctx.onSave(values);
  };

  return (
    <>
      <h2>AR Cards</h2>
      <ContentTable<ArCard>
        data={ctx.data as ArCard[]}
        total={ctx.total}
        page={ctx.page}
        perPage={ctx.perPage}
        loading={ctx.loading}
        columns={tableColumns}
        onSearch={ctx.setSearch}
        onPageChange={ctx.onPageChange}
        onAdd={() => { form.resetFields(); form.setFieldsValue({ is_free: true }); ctx.onAdd(); }}
        onEdit={(item) => { form.setFieldsValue(item); ctx.onEdit(item); }}
        onDelete={ctx.onDelete}
        onToggleVisibility={ctx.onToggleVisibility}
        onSetFree={ctx.onSetFree}
      />
      <Modal
        title={ctx.editItem ? 'Edit AR Card' : 'New AR Card'}
        open={ctx.modalOpen}
        onOk={handleSave}
        onCancel={() => ctx.setModalOpen(false)}
        confirmLoading={ctx.saving}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="Title" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="type" label="Type" rules={[{ required: true }]}>
            <Select options={[
              { value: 'alphabet', label: 'Alphabet' },
              { value: 'number', label: 'Number' },
              { value: 'animal', label: 'Animal' },
            ]} />
          </Form.Item>
          <Form.Item name="file_url" label="File URL" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="sound_url" label="Sound URL">
            <Input />
          </Form.Item>
          <Form.Item name="short_code" label="Short Code">
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} placeholder="Shown on the card detail screen in the app" showCount />
          </Form.Item>
          <Form.Item name="image_url" label="Image URL">
            <Input />
          </Form.Item>
          <Form.Item name="printable_img" label="Printable Image URL">
            <Input />
          </Form.Item>
          <AccessField hasProduct={(ctx.editItem as ArCard | null)?.price_idr != null} />
        </Form>
      </Modal>
    </>
  );
}
