import {
  Table,
  Tag,
  Typography,
  Button,
  Switch,
  Popconfirm,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  message,
  Descriptions,
  Spin,
  Tooltip,
} from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { productsApi } from '../../api/admin';
import type { Product, CreateProductInput, StrikeOverride } from '../../api/admin';
import { arCardsApi, fairyTalesApi } from '../../api/content';
import type { ColumnsType } from 'antd/es/table';
import StrikePriceFields from '../../components/StrikePriceFields';
import StrikePriceCell from '../../components/StrikePriceCell';
import { formToOverride, overrideToForm, type StrikeFormValues } from '../../utils/strikePrice';
import { isOnPriceStep, MAX_CART_TOTAL_IDR } from '../../utils/priceStep';

const { Text, Link } = Typography;

interface ContentOption {
  id: string;
  title: string;
}

const QUERY_KEY = ['products'];

const PRICE_RULES = [
  { required: true, message: 'Price is required' },
  {
    validator: (_: unknown, value: number | null | undefined) =>
      value == null || isOnPriceStep(value)
        ? Promise.resolve()
        : Promise.reject(new Error('Harga harus kelipatan Rp 1.000 (mis. 1.000, 5.000, 15.000)')),
  },
];

const PRICE_EXTRA = `Kelipatan Rp 1.000. Total keranjang maksimal Rp ${MAX_CART_TOTAL_IDR.toLocaleString('id-ID')}.`;

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [contentModalProduct, setContentModalProduct] = useState<Product | null>(null);
  const [editForm] = Form.useForm<{ price_idr: number; play_product_id?: string } & StrikeFormValues>();
  const watchedEditPrice = Form.useWatch('price_idr', editForm);
  const [form] = Form.useForm<{
    feature_code: 'AR_CARD' | 'DONGENG';
    content_id: string;
    price_idr: number;
    play_product_id?: string;
  }>();
  const watchedFeatureCode = Form.useWatch('feature_code', form);

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => productsApi.list().then((r) => r.data),
  });

  const { data: arCards, isLoading: arCardsLoading } = useQuery({
    queryKey: ['ar-cards', 'for-product-picker'],
    queryFn: () => arCardsApi.list({ per_page: 500 }).then((r) => (r.data as ContentOption[]) ?? []),
    enabled: modalOpen && watchedFeatureCode === 'AR_CARD',
  });

  const { data: fairyTales, isLoading: fairyTalesLoading } = useQuery({
    queryKey: ['fairy-tales', 'for-product-picker'],
    queryFn: () => fairyTalesApi.list({ per_page: 500 }).then((r) => (r.data as ContentOption[]) ?? []),
    enabled: modalOpen && watchedFeatureCode === 'DONGENG',
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  const createMutation = useMutation({
    mutationFn: (d: CreateProductInput) => productsApi.create(d),
    onSuccess: () => { invalidate(); closeModal(); },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      message.error(msg || 'Failed to create product');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: productsApi.remove,
    onSuccess: invalidate,
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      message.error(msg || 'Failed to delete product');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      productsApi.toggleActive(id, isActive),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      priceIdr,
      strike,
      playProductId,
    }: {
      id: string;
      priceIdr: number;
      strike: StrikeOverride;
      playProductId: string | null;
    }) => productsApi.update(id, priceIdr, strike, playProductId),
    onSuccess: () => { invalidate(); closeEditModal(); },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      message.error(msg || 'Failed to update product');
    },
  });

  const openCreate = () => {
    form.resetFields();
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    form.resetFields();
  };

  const openEdit = (product: Product) => {
    setEditingProduct(product);
    editForm.setFieldsValue({
      price_idr: product.price_idr,
      play_product_id: product.play_product_id ?? undefined,
      ...overrideToForm(product),
    });
  };

  const closeEditModal = () => {
    setEditingProduct(null);
    editForm.resetFields();
  };

  const handleEditSubmit = async () => {
    const values = await editForm.validateFields();
    if (editingProduct) {
      updateMutation.mutate({
        id: editingProduct.id,
        priceIdr: values.price_idr,
        strike: formToOverride(values),
        // The form always shows the current mapping, so send it as it is:
        // a blank field clears it.
        playProductId: values.play_product_id?.trim() || null,
      });
    }
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const input: CreateProductInput = {
      feature_code: values.feature_code,
      price_idr: values.price_idr,
      ...(values.play_product_id?.trim() ? { play_product_id: values.play_product_id.trim() } : {}),
      ...(values.feature_code === 'AR_CARD'
        ? { ar_card_id: values.content_id }
        : { dongeng_id: values.content_id }),
    };
    createMutation.mutate(input);
  };

  const contentOptions = watchedFeatureCode === 'AR_CARD' ? arCards : fairyTales;
  const contentOptionsLoading = watchedFeatureCode === 'AR_CARD' ? arCardsLoading : fairyTalesLoading;

  const columns: ColumnsType<Product> = [
    {
      title: 'Content',
      dataIndex: 'id',
      key: 'content',
      ellipsis: true,
      render: (v: string, record: Product) => (
        <div>
          <Link onClick={() => setContentModalProduct(record)}>
            <Text copyable={{ text: v }}>{v.slice(0, 8)}…</Text>
          </Link>
          <br />
          <Tag color={record.feature_code === 'AR_CARD' ? 'blue' : 'purple'}>
            {record.feature_code === 'AR_CARD' ? 'AR Card' : record.feature_code === 'DONGENG' ? 'Dongeng' : '—'}
          </Tag>
          {record.content_is_free && (
            <Tooltip title="This item is flagged free, so nobody needs to buy this product. It is kept, and you can make the item premium again.">
              <Tag color="green">Free override</Tag>
            </Tooltip>
          )}
        </div>
      ),
    },
    {
      title: 'ID',
      dataIndex: 'feature_id',
      key: 'feature_id',
      ellipsis: true,
      render: (v: string) => <Text copyable={{ text: v }}>{v.slice(0, 8)}…</Text>,
    },
    {
      title: 'Price',
      dataIndex: 'price_idr',
      key: 'price_idr',
      render: (v: number) => `Rp ${v.toLocaleString('id-ID')}`,
    },
    {
      title: 'Play Billing',
      dataIndex: 'play_product_id',
      key: 'play_product_id',
      render: (v: string | null | undefined) =>
        v ? (
          <div>
            <Tag color="green">Mapped</Tag>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {v}
            </Text>
          </div>
        ) : (
          <Tag color="default">Unmapped</Tag>
        ),
    },
    {
      title: 'Harga coret',
      key: 'strike',
      render: (_: unknown, record: Product) => <StrikePriceCell item={record} />,
    },
    {
      title: 'Active',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (v: boolean, record: Product) => (
        <Switch
          checked={v}
          loading={toggleMutation.isPending && toggleMutation.variables?.id === record.id}
          onChange={(checked) => toggleMutation.mutate({ id: record.id, isActive: checked })}
        />
      ),
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (v: string) => new Date(v).toLocaleString('id-ID'),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: unknown, record: Product) => (
        <Space>
          <Button icon={<EditOutlined />} size="small" onClick={() => openEdit(record)}>
            Edit
          </Button>
          <Popconfirm
            title="Delete product?"
            description="This action cannot be undone."
            onConfirm={() => deleteMutation.mutate(record.id)}
            okText="Delete"
            okButtonProps={{ danger: true }}
          >
            <Button icon={<DeleteOutlined />} size="small" danger loading={deleteMutation.isPending && deleteMutation.variables === record.id}>
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Products</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          Add Product
        </Button>
      </div>

      <Table<Product>
        rowKey="id"
        dataSource={data}
        columns={columns}
        loading={isLoading}
        rowClassName={(record: Product) => (record.is_active ? '' : 'row-inactive')}
        pagination={{ pageSize: 20 }}
      />

      <style>{`.row-inactive td { color: #bbb !important; }`}</style>

      <Modal
        title="Add Product"
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={closeModal}
        okText="Create"
        confirmLoading={createMutation.isPending}
        width={520}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="feature_code"
            label="Feature"
            rules={[{ required: true, message: 'Feature is required' }]}
          >
            <Select
              placeholder="Select feature type"
              onChange={() => form.setFieldValue('content_id', undefined)}
              options={[
                { value: 'AR_CARD', label: 'AR Card' },
                { value: 'DONGENG', label: 'Dongeng' },
              ]}
            />
          </Form.Item>
          {watchedFeatureCode && (
            <Form.Item
              name="content_id"
              label={watchedFeatureCode === 'AR_CARD' ? 'AR Card' : 'Dongeng'}
              rules={[{ required: true, message: 'Content is required' }]}
            >
              <Select
                placeholder={`Select ${watchedFeatureCode === 'AR_CARD' ? 'an AR card' : 'a dongeng'}`}
                loading={contentOptionsLoading}
                showSearch
                optionFilterProp="label"
                options={(contentOptions ?? []).map((item) => ({ value: item.id, label: item.title }))}
              />
            </Form.Item>
          )}
          <Form.Item
            name="price_idr"
            label="Price (IDR)"
            rules={PRICE_RULES}
            extra={PRICE_EXTRA}
          >
            <InputNumber
              style={{ width: '100%' }}
              min={1}
              precision={0}
              formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={(v) => parseInt((v ?? '').replace(/,/g, ''), 10) as 1}
            />
          </Form.Item>
          <Form.Item
            name="play_product_id"
            label="Play Product ID"
            extra="Google Play Console in-app product SKU. Without it this item can't be bought through Google Play Billing."
          >
            <Input placeholder="e.g. card_frog" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingProduct ? `Edit Product — ${editingProduct.display_name || editingProduct.id.slice(0, 8) + '…'}` : 'Edit Product'}
        open={editingProduct !== null}
        onOk={handleEditSubmit}
        onCancel={closeEditModal}
        okText="Save"
        confirmLoading={updateMutation.isPending}
        width={520}
      >
        <Form form={editForm} layout="vertical">
          <Form.Item
            name="price_idr"
            label="Price (IDR)"
            rules={PRICE_RULES}
            extra={PRICE_EXTRA}
          >
            <InputNumber
              style={{ width: '100%' }}
              min={1}
              precision={0}
              formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={(v) => parseInt((v ?? '').replace(/,/g, ''), 10) as 1}
            />
          </Form.Item>
          <Form.Item
            name="play_product_id"
            label="Play Product ID"
            extra="Google Play Console in-app product SKU. Clear it to stop selling this item through Google Play."
          >
            <Input placeholder="e.g. card_frog" />
          </Form.Item>
          <StrikePriceFields price={watchedEditPrice} allowInherit />
        </Form>
      </Modal>

      {contentModalProduct && (
        <ContentDetailModal product={contentModalProduct} onClose={() => setContentModalProduct(null)} />
      )}
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ContentRecord = Record<string, any>;

function ContentDetailModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const isArCard = product.feature_code === 'AR_CARD';

  const { data, isLoading, isError } = useQuery({
    queryKey: ['product-content-detail', product.feature_code, product.content_id],
    queryFn: (): Promise<ContentRecord> =>
      isArCard ? arCardsApi.get(product.content_id) : fairyTalesApi.get(product.content_id),
    enabled: !!product.content_id,
  });

  return (
    <Modal
      title={isArCard ? 'AR Card Detail' : 'Dongeng Detail'}
      open
      onCancel={onClose}
      footer={<Button onClick={onClose}>Close</Button>}
      width={520}
    >
      {!product.content_id ? (
        <Text type="secondary">This product has no linked content (it may have been deleted).</Text>
      ) : isLoading ? (
        <Spin />
      ) : isError || !data ? (
        <Text type="secondary">Failed to load content detail.</Text>
      ) : (
        <Descriptions bordered column={1} size="small">
          <Descriptions.Item label="Title">{data.title || '—'}</Descriptions.Item>
          {isArCard ? (
            <>
              <Descriptions.Item label="Type">{data.type || '—'}</Descriptions.Item>
              <Descriptions.Item label="Short Code">{data.short_code || '—'}</Descriptions.Item>
              <Descriptions.Item label="Model URL">{data.file_url || '—'}</Descriptions.Item>
            </>
          ) : (
            <>
              <Descriptions.Item label="Age Range">{`${data.age_start ?? '?'}–${data.age_end ?? '?'}`}</Descriptions.Item>
              <Descriptions.Item label="Free">{data.is_free ? 'Yes' : 'No'}</Descriptions.Item>
              <Descriptions.Item label="Image URL">{data.image_url || '—'}</Descriptions.Item>
            </>
          )}
          <Descriptions.Item label="Hidden">{data.hidden ? 'Yes' : 'No'}</Descriptions.Item>
        </Descriptions>
      )}
    </Modal>
  );
}
