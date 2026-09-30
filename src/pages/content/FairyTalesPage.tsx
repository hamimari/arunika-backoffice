import { Modal, Form, Input, InputNumber, Select, Button, Table, Space, Popconfirm, Alert, Spin } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import ContentTable from '../../components/ContentTable';
import AccessCell from '../../components/AccessCell';
import AccessField from '../../components/AccessField';
import { fairyTalesApi, categoriesApi, fairyTalePagesApi, dongengCategoriesApi } from '../../api/content';
import { useContentPage } from '../../hooks/useContentPage';
import type { ColumnsType } from 'antd/es/table';
import type { Access } from '../../components/AccessCell';
import {
  checkPageImage,
  croppedHeightFraction,
  loadImageSize,
  pageImageError,
  PAGE_IMAGE_LOAD_ERROR,
  type ImageSize,
} from '../../lib/pageImage';

interface FairyTale {
  id: string;
  title: string;
  age_start: number;
  age_end: number;
  image_url: string;
  audio_url: string;
  is_free: boolean;
  access?: Access;
  price_idr?: number | null;
  category_id: string;
  dongeng_category_id?: string;
  dongeng_sub_category_id?: string;
  duration?: number;
  hidden?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

interface DongengCategory {
  id: string;
  name: string;
  parent_id?: string | null;
}

interface FairyTalePage {
  id: string;
  page_number?: number;
  image_url?: string;
  audio_url?: string;
  text?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

const tableColumns: ColumnsType<FairyTale> = [
  { title: 'Title', dataIndex: 'title', key: 'title' },
  { title: 'Age Range', key: 'age', render: (_, r) => `${r.age_start}–${r.age_end}` },
  { title: 'Access', key: 'access', render: (_, r) => <AccessCell item={r} /> },
];

// Blocks saving a page whose image the app would crop badly (see lib/pageImage).
async function validatePageImage(_: unknown, value?: string) {
  const url = value?.trim();
  if (!url) return;
  let size: ImageSize;
  try {
    size = await loadImageSize(url);
  } catch {
    throw new Error(PAGE_IMAGE_LOAD_ERROR);
  }
  const result = checkPageImage(size);
  if (result !== 'ok') throw new Error(pageImageError(size, result));
}

// Shows the image with the strips a ~2:1 phone screen crops away dimmed.
function PageImagePreview({ url }: { url?: string }) {
  const [loaded, setLoaded] = useState<{ url: string; size: ImageSize } | null>(null);
  const trimmed = url?.trim() ?? '';

  useEffect(() => {
    if (!trimmed) return;
    let cancelled = false;
    // Wait for typing to pause so partial URLs aren't fetched.
    const timer = setTimeout(() => {
      loadImageSize(trimmed)
        .then((size) => { if (!cancelled) setLoaded({ url: trimmed, size }); })
        .catch(() => { /* the field validator reports the load error */ });
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [trimmed]);

  if (!trimmed || loaded?.url !== trimmed) return null;
  const { size } = loaded;
  const band = `${(croppedHeightFraction(size) / 2) * 100}%`;
  const dim = { position: 'absolute', left: 0, right: 0, height: band, background: 'rgba(0,0,0,0.55)' } as const;
  return (
    <div data-testid="page-image-preview" style={{ marginBottom: 16 }}>
      <div style={{ position: 'relative', width: 240, lineHeight: 0 }}>
        <img src={trimmed} alt="Page image preview" style={{ width: '100%', borderRadius: 4 }} />
        <div data-testid="crop-band-top" style={{ ...dim, top: 0 }} />
        <div data-testid="crop-band-bottom" style={{ ...dim, bottom: 0 }} />
      </div>
      <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
        {size.width} × {size.height} — dimmed areas are cut off on a phone
      </div>
    </div>
  );
}

// --- Pages sub-component ---
function FairyTalePages({ fairyTaleId }: { fairyTaleId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ['fairy-tale-pages', fairyTaleId];
  const [pageModalOpen, setPageModalOpen] = useState(false);
  const [editingPage, setEditingPage] = useState<FairyTalePage | null>(null);
  const [pageForm] = Form.useForm();
  const pageImageUrl = Form.useWatch('image_url', pageForm) as string | undefined;

  const { data: pages, isLoading, isError } = useQuery<FairyTalePage[]>({
    queryKey,
    queryFn: () => fairyTalePagesApi.list(fairyTaleId) as Promise<FairyTalePage[]>,
    retry: 1,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const createMutation = useMutation({
    mutationFn: (data: unknown) => fairyTalePagesApi.create(fairyTaleId, data),
    onSuccess: () => { invalidate(); setPageModalOpen(false); pageForm.resetFields(); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) =>
      fairyTalePagesApi.update(fairyTaleId, id, data),
    onSuccess: () => { invalidate(); setPageModalOpen(false); pageForm.resetFields(); },
  });

  const deleteMutation = useMutation({
    mutationFn: (pageId: string) => fairyTalePagesApi.delete(fairyTaleId, pageId),
    onSuccess: invalidate,
  });

  const openAdd = () => {
    setEditingPage(null);
    pageForm.resetFields();
    setPageModalOpen(true);
  };

  const openEdit = (page: FairyTalePage) => {
    setEditingPage(page);
    pageForm.setFieldsValue(page);
    setPageModalOpen(true);
  };

  const handleSave = async () => {
    let values;
    try {
      values = await pageForm.validateFields();
    } catch {
      return; // antd shows the field errors; the modal stays open
    }
    if (editingPage) {
      updateMutation.mutate({ id: editingPage.id, data: values });
    } else {
      createMutation.mutate(values);
    }
  };

  const pageColumns: ColumnsType<FairyTalePage> = [
    { title: '#', dataIndex: 'page_number', key: 'page_number', width: 60 },
    { title: 'Image URL', dataIndex: 'image_url', key: 'image_url', ellipsis: true },
    { title: 'Audio URL', dataIndex: 'audio_url', key: 'audio_url', ellipsis: true },
    { title: 'Text', dataIndex: 'text', key: 'text', ellipsis: true },
    {
      title: 'Actions',
      key: 'actions',
      width: 140,
      render: (_: unknown, record: FairyTalePage) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>Edit</Button>
          <Popconfirm
            title="Delete this page?"
            onConfirm={() => deleteMutation.mutate(record.id)}
            okText="Delete"
            okButtonProps={{ danger: true }}
          >
            <Button size="small" danger icon={<DeleteOutlined />}>Delete</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  if (isError) {
    return (
      <Alert
        type="warning"
        message="Could not load pages"
        description="The pages API may not be available for this entry."
        style={{ margin: '8px 0' }}
      />
    );
  }

  return (
    <div style={{ padding: '8px 0 8px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong>Pages</strong>
        <Button size="small" type="primary" icon={<PlusOutlined />} onClick={openAdd}>
          Add Page
        </Button>
      </div>

      {isLoading ? (
        <Spin size="small" />
      ) : (
        <Table<FairyTalePage>
          rowKey="id"
          dataSource={pages}
          columns={pageColumns}
          pagination={false}
          size="small"
        />
      )}

      <Modal
        title={editingPage ? 'Edit Page' : 'Add Page'}
        open={pageModalOpen}
        onOk={handleSave}
        onCancel={() => { setPageModalOpen(false); pageForm.resetFields(); }}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
      >
        <Form form={pageForm} layout="vertical">
          <Form.Item name="page_number" label="Page Number">
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="image_url"
            label="Image URL"
            validateTrigger="onBlur"
            rules={[{ validator: validatePageImage }]}
            extra="Landscape, about 16:9, at least 1280 px wide"
          >
            <Input />
          </Form.Item>
          <PageImagePreview url={pageImageUrl} />
          <Form.Item name="audio_url" label="Audio URL">
            <Input />
          </Form.Item>
          <Form.Item name="text" label="Text">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

// --- Main page ---
export default function FairyTalesPage() {
  const ctx = useContentPage('fairy-tales', fairyTalesApi);
  const [form] = Form.useForm();

  const { data: categoriesData } = useQuery({
    queryKey: ['content', 'categories', 'all'],
    queryFn: () => categoriesApi.list({ page: 1, per_page: 100 }),
  });
  const categoryOptions = (categoriesData?.data ?? []).map((c: { id: string; name: string }) => ({
    value: c.id,
    label: c.name,
  }));

  // Dongeng's own dedicated (hierarchical) category taxonomy — separate from
  // the generic `categoriesApi`/`category_id` field above.
  const { data: dongengCategoriesData } = useQuery({
    queryKey: ['content', 'dongeng-categories', 'all'],
    queryFn: () => dongengCategoriesApi.list({ page: 1, per_page: 100 }),
  });
  const dongengCategories = (dongengCategoriesData?.data ?? []) as DongengCategory[];
  const dongengCategoryOptions = dongengCategories
    .filter((c) => !c.parent_id)
    .map((c) => ({ value: c.id, label: c.name }));

  const selectedDongengCategoryId = Form.useWatch('dongeng_category_id', form);
  const dongengSubCategoryOptions = dongengCategories
    .filter((c) => c.parent_id === selectedDongengCategoryId)
    .map((c) => ({ value: c.id, label: c.name }));

  const handleSave = async () => {
    const values = await form.validateFields();
    // Category columns are nullable UUIDs: send null for "no category", never ''.
    for (const key of ['category_id', 'dongeng_category_id', 'dongeng_sub_category_id']) {
      if (!values[key]) values[key] = null;
    }
    ctx.onSave(values);
  };

  return (
    <>
      <h2>Fairy Tales</h2>
      <ContentTable<FairyTale>
        data={ctx.data as FairyTale[]}
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
        expandable={{
          expandedRowRender: (record: FairyTale) => <FairyTalePages fairyTaleId={record.id} />,
        }}
      />
      <Modal
        title={ctx.editItem ? 'Edit Fairy Tale' : 'New Fairy Tale'}
        open={ctx.modalOpen}
        onOk={handleSave}
        onCancel={() => ctx.setModalOpen(false)}
        confirmLoading={ctx.saving}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="Title" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="image_url" label="Image URL" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="audio_url" label="Audio URL">
            <Input />
          </Form.Item>
          <Form.Item name="age_start" label="Age Start">
            <InputNumber min={0} max={18} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="age_end" label="Age End">
            <InputNumber min={0} max={18} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="duration" label="Duration (seconds)">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <AccessField hasProduct={(ctx.editItem as FairyTale | null)?.price_idr != null} />
          <Form.Item name="category_id" label="Category">
            <Select
              options={categoryOptions}
              placeholder="Select a category"
              allowClear
            />
          </Form.Item>
          <Form.Item name="dongeng_category_id" label="Dongeng Category">
            <Select
              options={dongengCategoryOptions}
              placeholder="Select a dongeng category"
              allowClear
              onChange={() => form.setFieldValue('dongeng_sub_category_id', undefined)}
            />
          </Form.Item>
          {dongengSubCategoryOptions.length > 0 && (
            <Form.Item name="dongeng_sub_category_id" label="Dongeng Sub-category">
              <Select
                options={dongengSubCategoryOptions}
                placeholder="Select a sub-category"
                allowClear
              />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </>
  );
}
