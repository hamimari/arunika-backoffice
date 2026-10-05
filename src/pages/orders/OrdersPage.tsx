import {
  Table,
  Tag,
  Select,
  Input,
  Space,
  Typography,
  Button,
  message,
  Modal,
  Descriptions,
  Spin,
  Radio,
  Checkbox,
  Drawer,
  Alert,
  Empty,
  DatePicker,
} from 'antd';
import { SyncOutlined, RollbackOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ordersApi, usersApi, productsApi, premiumPackagesApi, orderRefundsApi } from '../../api/admin';
import type { Order, OrderPhase, OrderRefund, RefundType } from '../../api/admin';
import type { Dayjs } from 'dayjs';
import type { ColumnsType } from 'antd/es/table';

const { Text, Link } = Typography;
const { Search } = Input;

// Surfaces the backend's own {"error": "..."} message when there is one
// (e.g. "purchase is not valid") instead of a generic string that hides why
// the action actually failed.
function extractErrorMessage(err: unknown, fallback: string): string {
  const detail =
    err && typeof err === 'object' && 'response' in err
      ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
      : undefined;
  return detail ?? fallback;
}

const STATUS_COLORS: Record<Order['status'], string> = {
  PENDING: 'orange',
  PAID: 'green',
  FAILED: 'red',
  EXPIRED: 'default',
  REFUNDED: 'volcano',
};

const PHASE_LABEL: Record<OrderPhase, { label: string; color: string }> = {
  menunggu: { label: 'Menunggu', color: 'orange' },
  diproses: { label: 'Dibayar, belum diberikan', color: 'gold' },
  diberikan: { label: 'Diberikan', color: 'green' },
  gagal: { label: 'Gagal', color: 'red' },
  kedaluwarsa: { label: 'Kedaluwarsa', color: 'default' },
  dikembalikan: { label: 'Dikembalikan', color: 'volcano' },
};

export default function OrdersPage() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [userModalId, setUserModalId] = useState<string | null>(null);
  const [itemModalOrder, setItemModalOrder] = useState<Order | null>(null);
  const [recoverPlayOrder, setRecoverPlayOrder] = useState<Order | null>(null);
  const [refundOrder, setRefundOrder] = useState<Order | null>(null);
  const [refundsOrder, setRefundsOrder] = useState<Order | null>(null);
  const [cartOnly, setCartOnly] = useState(false);
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const perPage = 20;
  const queryClient = useQueryClient();

  const from = range?.[0]?.format('YYYY-MM-DD');
  const to = range?.[1]?.format('YYYY-MM-DD');
  const queryKey = ['orders', statusFilter, search, page, cartOnly, from, to];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      ordersApi.list({
        status: statusFilter,
        search: search || undefined,
        page,
        per_page: perPage,
        cart: cartOnly || undefined,
        from,
        to,
      }),
  });

  const regrantMutation = useMutation({
    mutationFn: (id: string) => ordersApi.regrant(id),
    onSuccess: () => {
      message.success('Item sudah diberikan ke pengguna');
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (err: unknown) => message.error(extractErrorMessage(err, 'Gagal memberikan ulang')),
  });

  const syncMutation = useMutation({
    mutationFn: (id: string) => ordersApi.sync(id),
    onSuccess: () => {
      message.success('Order status synced');
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (err: unknown) => message.error(extractErrorMessage(err, 'Failed to sync order')),
  });

  const reconcilePlayMutation = useMutation({
    mutationFn: () => ordersApi.reconcilePlay(),
    onSuccess: ({ data }) => {
      message.success(`Checked Google Play for refunds — ${data.reconciled} order(s) revoked`);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (err: unknown) => message.error(extractErrorMessage(err, 'Failed to reconcile with Google Play')),
  });

  const orders = data?.data ?? [];
  const total = data?.total ?? 0;

  const columns: ColumnsType<Order> = [
    {
      title: 'Order ID',
      dataIndex: 'id',
      key: 'id',
      ellipsis: true,
      render: (v: string) => <Text copyable={{ text: v }}>{v.slice(0, 8)}…</Text>,
    },
    {
      title: 'User',
      key: 'user',
      render: (_: unknown, record: Order) => (
        <Link onClick={() => setUserModalId(record.user_id)}>
          <div>{record.user_name || record.user_id.slice(0, 8) + '…'}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.user_email}
          </Text>
        </Link>
      ),
    },
    {
      title: 'Item',
      key: 'item',
      render: (_: unknown, record: Order) => (
        <Link onClick={() => setItemModalOrder(record)}>
          {record.is_cart ? (
            <span>
              <Tag color="cyan">Keranjang</Tag> {record.items?.length ?? 0} item
            </span>
          ) : record.package_id ? (
            <span>
              <Tag color="purple">Package</Tag> {record.package_name ?? record.package_id.slice(0, 8) + '…'}
            </span>
          ) : (
            <span>
              <Tag color="blue">Product</Tag> {record.product_name ?? record.product_id?.slice(0, 8) + '…'}
            </span>
          )}
        </Link>
      ),
    },
    {
      title: 'Amount',
      dataIndex: 'amount_idr',
      key: 'amount_idr',
      render: (v: number) => `Rp ${v.toLocaleString('id-ID')}`,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (v: Order['status'], record: Order) => (
        <Space size={4} wrap>
          <Tag color={STATUS_COLORS[v] ?? 'default'}>{v}</Tag>
          {record.phase === 'diproses' && <Tag color={PHASE_LABEL.diproses.color}>{PHASE_LABEL.diproses.label}</Tag>}
        </Space>
      ),
    },
    {
      title: 'Provider',
      dataIndex: 'provider',
      key: 'provider',
      render: (v: Order['provider']) => (
        <Tag color={v === 'google_play' ? 'blue' : 'purple'}>{v === 'google_play' ? 'Google Play' : 'Midtrans'}</Tag>
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
      render: (_: unknown, record: Order) => {
        if (record.status !== 'PENDING') {
          return (
            <Space>
              {isRefundable(record) && (
                <Button size="small" danger icon={<RollbackOutlined />} onClick={() => setRefundOrder(record)}>
                  Refund
                </Button>
              )}
              {(record.refund_count ?? 0) > 0 && (
                <Button size="small" type="link" onClick={() => setRefundsOrder(record)}>
                  Refunds ({record.refund_count})
                </Button>
              )}
            </Space>
          );
        }

        // One action per record, driven by which payment rail the order
        // was created against — a Play order with a token already on file
        // syncs in one click just like Midtrans; only a Play order with no
        // token yet needs an admin to supply one.
        // Paid in Google Play but the grant has not happened yet: retry it
        // with the token on file.
        if (record.phase === 'diproses') {
          return (
            <Button
              size="small"
              type="primary"
              loading={regrantMutation.isPending && regrantMutation.variables === record.id}
              onClick={() => regrantMutation.mutate(record.id)}
            >
              Berikan ulang
            </Button>
          );
        }
        if (record.provider === 'google_play' && !record.has_purchase_token) {
          return (
            <Button size="small" onClick={() => setRecoverPlayOrder(record)}>
              Recover Play
            </Button>
          );
        }
        return (
          <Button
            size="small"
            icon={<SyncOutlined />}
            loading={syncMutation.isPending && syncMutation.variables === record.id}
            onClick={() => syncMutation.mutate(record.id)}
          >
            {record.provider === 'google_play' ? 'Sync Google Play' : 'Sync Midtrans'}
          </Button>
        );
      },
    },
  ];

  return (
    <>
      <h2>Orders</h2>
      <Space style={{ marginBottom: 16 }} wrap>
        <Search
          placeholder="Search by name, email, phone, user ID, or order ID"
          allowClear
          style={{ width: 340 }}
          onSearch={(v) => { setSearch(v); setPage(1); }}
          onChange={(e) => { if (!e.target.value) { setSearch(''); setPage(1); } }}
        />
        <Select
          placeholder="Filter by status"
          allowClear
          style={{ width: 180 }}
          onChange={(v) => { setStatusFilter(v); setPage(1); }}
          options={[
            { value: 'PENDING', label: 'Pending' },
            { value: 'PROCESSING', label: 'Dibayar, belum diberikan' },
            { value: 'PAID', label: 'Paid' },
            { value: 'FAILED', label: 'Failed' },
            { value: 'EXPIRED', label: 'Expired' },
            { value: 'REFUNDED', label: 'Refunded' },
          ]}
        />
        <DatePicker.RangePicker
          aria-label="Filter by date"
          onChange={(v) => { setRange(v); setPage(1); }}
        />
        <Checkbox checked={cartOnly} onChange={(e) => { setCartOnly(e.target.checked); setPage(1); }}>
          Hanya keranjang
        </Checkbox>
        <Button
          icon={<SyncOutlined />}
          loading={reconcilePlayMutation.isPending}
          onClick={() => reconcilePlayMutation.mutate()}
        >
          Check Google Play Refunds
        </Button>
      </Space>
      <Table<Order>
        rowKey="id"
        dataSource={orders}
        columns={columns}
        loading={isLoading}
        scroll={{ x: 1100 }}
        pagination={{
          current: page,
          pageSize: perPage,
          total,
          showSizeChanger: false,
          onChange: (p) => setPage(p),
        }}
      />

      {userModalId && (
        <UserDetailModal userId={userModalId} onClose={() => setUserModalId(null)} />
      )}
      {itemModalOrder && (
        <ItemDetailModal order={itemModalOrder} onClose={() => setItemModalOrder(null)} />
      )}
      {recoverPlayOrder && (
        <RecoverPlayModal order={recoverPlayOrder} onClose={() => setRecoverPlayOrder(null)} />
      )}
      {refundOrder && <RefundModal order={refundOrder} onClose={() => setRefundOrder(null)} />}
      {refundsOrder && <RefundsDrawer order={refundsOrder} onClose={() => setRefundsOrder(null)} />}
    </>
  );
}

// Manually settles a Google Play purchase stuck PENDING because the app
// never called verify — an admin supplies the purchase token obtained
// out-of-band (e.g. a support case), and this reuses the same verify path
// a normal purchase completes through.
function RecoverPlayModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const [purchaseToken, setPurchaseToken] = useState('');
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => ordersApi.recoverPlay(order.id, purchaseToken.trim()),
    onSuccess: () => {
      message.success('Purchase verified and entitlement granted');
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      onClose();
    },
    onError: (err: unknown) => message.error(extractErrorMessage(err, 'Failed to verify purchase')),
  });

  return (
    <Modal
      title="Recover Google Play Purchase"
      open
      onCancel={onClose}
      onOk={() => mutation.mutate()}
      okButtonProps={{ disabled: !purchaseToken.trim(), loading: mutation.isPending }}
      okText="Verify & Grant"
    >
      <Text type="secondary">
        Order {order.id.slice(0, 8)}… for {order.package_name ?? order.package_id}. Paste the Google Play purchase
        token for this order (from Play Console's order management, a support case, or app logs) — this re-runs the
        same verification a normal purchase completes through.
      </Text>
      <Input.TextArea
        style={{ marginTop: 12 }}
        rows={3}
        placeholder="Purchase token"
        value={purchaseToken}
        onChange={(e) => setPurchaseToken(e.target.value)}
      />
    </Modal>
  );
}

function UserDetailModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['user', userId],
    queryFn: () => usersApi.get(userId),
  });

  const user = data?.user;
  const sub = data?.subscription;

  return (
    <Modal title="User Detail" open onCancel={onClose} footer={<Button onClick={onClose}>Close</Button>} width={520}>
      {isLoading ? (
        <Spin />
      ) : (
        <Descriptions bordered column={1} size="small">
          <Descriptions.Item label="Name">{user?.name || '—'}</Descriptions.Item>
          <Descriptions.Item label="Email">{user?.email_address || '—'}</Descriptions.Item>
          <Descriptions.Item label="Phone">{user?.phone_number || '—'}</Descriptions.Item>
          <Descriptions.Item label="Address">{user?.address || '—'}</Descriptions.Item>
          <Descriptions.Item label="City">{user?.city || '—'}</Descriptions.Item>
          <Descriptions.Item label="Joined">
            {user?.created_at ? new Date(user.created_at).toLocaleString('id-ID') : '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Subscription">
            <Tag color={sub?.status === 'premium' ? 'gold' : 'default'}>{sub?.status ?? 'free'}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Subscription Expires">
            {sub?.expires_at ? new Date(sub.expires_at).toLocaleString('id-ID') : '—'}
          </Descriptions.Item>
        </Descriptions>
      )}
    </Modal>
  );
}

function ItemDetailModal({ order, onClose }: { order: Order; onClose: () => void }) {
  if (order.is_cart) return <CartOrderModal order={order} onClose={onClose} />;
  return <SingleItemModal order={order} onClose={onClose} />;
}

// A cart order: every item with its locked price, the totals and what
// support needs to find the payment in Google Play.
function CartOrderModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const items = order.items ?? [];
  const subtotal = items.reduce((sum, it) => sum + it.normal_idr, 0);
  const phase = order.phase ? PHASE_LABEL[order.phase] : undefined;
  return (
    <Modal title="Pesanan keranjang" open onCancel={onClose} footer={<Button onClick={onClose}>Close</Button>} width={600}>
      <Table
        size="small"
        rowKey="product_id"
        pagination={false}
        dataSource={items}
        columns={[
          { title: 'Item', dataIndex: 'title', key: 'title' },
          {
            title: 'Jenis',
            dataIndex: 'item_type',
            key: 'item_type',
            render: (v: string) => (v === 'dongeng' ? <Tag color="purple">Dongeng</Tag> : <Tag color="blue">Kartu AR</Tag>),
          },
          {
            title: 'Harga terkunci',
            key: 'price',
            render: (_: unknown, it) => (
              <span>
                {formatIdr(it.price_idr)}{' '}
                {it.normal_idr > it.price_idr && <Text delete type="secondary">{formatIdr(it.normal_idr)}</Text>}
              </span>
            ),
          },
        ]}
      />
      <Descriptions bordered column={1} size="small" style={{ marginTop: 16 }}>
        <Descriptions.Item label="Harga normal">{formatIdr(subtotal)}</Descriptions.Item>
        <Descriptions.Item label="Total">{formatIdr(order.amount_idr)}</Descriptions.Item>
        <Descriptions.Item label="Tahap">{phase ? <Tag color={phase.color}>{phase.label}</Tag> : '—'}</Descriptions.Item>
        <Descriptions.Item label="Diberikan">
          {order.granted_at ? new Date(order.granted_at).toLocaleString('id-ID') : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="Transaksi toko">
          {order.has_purchase_token ? 'Token Google Play tersimpan' : 'Belum ada'}
        </Descriptions.Item>
      </Descriptions>
    </Modal>
  );
}

function SingleItemModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const isPackage = !!order.package_id;

  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ['products'],
    queryFn: () => productsApi.list().then((r) => r.data),
    enabled: !isPackage,
  });

  const { data: packages, isLoading: packagesLoading } = useQuery({
    queryKey: ['premium-packages'],
    queryFn: () => premiumPackagesApi.list().then((r) => r.data),
    enabled: isPackage,
  });

  const product = products?.find((p) => p.id === order.product_id);
  const pkg = packages?.find((p) => p.id === order.package_id);
  const isLoading = isPackage ? packagesLoading : productsLoading;

  return (
    <Modal title="Item Detail" open onCancel={onClose} footer={<Button onClick={onClose}>Close</Button>} width={520}>
      {isLoading ? (
        <Spin />
      ) : isPackage ? (
        pkg ? (
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="Name">{pkg.name}</Descriptions.Item>
            <Descriptions.Item label="Subtitle">{pkg.subtitle}</Descriptions.Item>
            <Descriptions.Item label="Type">
              <Tag color={pkg.type === 'subscription' ? 'purple' : 'orange'}>
                {pkg.type === 'subscription' ? 'Subscription' : 'Content'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Price">{`Rp ${pkg.price_idr.toLocaleString('id-ID')}`}</Descriptions.Item>
            {pkg.duration_days && (
              <Descriptions.Item label="Duration">{`${pkg.duration_days} days`}</Descriptions.Item>
            )}
            <Descriptions.Item label="Active">
              {pkg.is_active ? <Tag color="green">Active</Tag> : <Tag>Inactive</Tag>}
            </Descriptions.Item>
          </Descriptions>
        ) : (
          <Text type="secondary">Package details unavailable (it may have been deleted).</Text>
        )
      ) : product ? (
        <Descriptions bordered column={1} size="small">
          <Descriptions.Item label="Name">{product.display_name || '—'}</Descriptions.Item>
          <Descriptions.Item label="Feature">
            <Tag color={product.feature_code === 'AR_CARD' ? 'blue' : 'purple'}>
              {product.feature_code === 'AR_CARD' ? 'AR Card' : product.feature_code === 'DONGENG' ? 'Dongeng' : '—'}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Price">{`Rp ${product.price_idr.toLocaleString('id-ID')}`}</Descriptions.Item>
          <Descriptions.Item label="Active">
            {product.is_active ? <Tag color="green">Active</Tag> : <Tag>Inactive</Tag>}
          </Descriptions.Item>
        </Descriptions>
      ) : (
        <Text type="secondary">Product details unavailable (it may have been deleted).</Text>
      )}
    </Modal>
  );
}

// ── Refunds ─────────────────────────────────────────────────────────────────

const MIN_REFUND_REASON = 10;

/** Only a PAID Google Play order with a purchase token can be refunded. */
function isRefundable(order: Order): boolean {
  return order.provider === 'google_play' && order.status === 'PAID' && order.has_purchase_token;
}

const formatIdr = (v: number) => `Rp ${v.toLocaleString('id-ID')}`;

// Refunds a Google Play order through Google (orders.refund, or
// subscriptionsv2.revoke for subscriptions) and removes the access it granted.
function RefundModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const isSubscription = order.package_type === 'subscription';
  const [refundType, setRefundType] = useState<RefundType>('FULL');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => ordersApi.refund(order.id, { reason: reason.trim(), refund_type: refundType }),
    onSuccess: () => {
      message.success('Refund berhasil — akses pengguna sudah dicabut');
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      onClose();
    },
    onError: (err: unknown) => message.error(extractErrorMessage(err, 'Refund failed')),
  });

  const reasonValid = reason.trim().length >= MIN_REFUND_REASON;
  const item = order.package_name ?? order.product_name ?? order.package_id ?? order.product_id ?? '—';

  return (
    <Modal
      title="Refund Google Play Order"
      open
      onCancel={onClose}
      onOk={() => mutation.mutate()}
      okText="Refund"
      okButtonProps={{ danger: true, disabled: !reasonValid || !confirmed, loading: mutation.isPending }}
    >
      <Descriptions bordered column={1} size="small" style={{ marginBottom: 16 }}>
        <Descriptions.Item label="User">{order.user_name || order.user_email || order.user_id}</Descriptions.Item>
        <Descriptions.Item label="Item">
          {item} {isSubscription && <Tag color="purple">Subscription</Tag>}
        </Descriptions.Item>
        <Descriptions.Item label="Amount">{formatIdr(order.amount_idr)}</Descriptions.Item>
        <Descriptions.Item label="Order">
          <Text copyable={{ text: order.id }}>{order.id.slice(0, 8)}…</Text>
        </Descriptions.Item>
      </Descriptions>

      {isSubscription && (
        <div style={{ marginBottom: 16 }}>
          <Text strong>Refund type</Text>
          <Radio.Group
            style={{ display: 'block', marginTop: 8 }}
            value={refundType}
            onChange={(e) => setRefundType(e.target.value)}
            options={[
              { value: 'FULL', label: 'Full — the latest charge in full' },
              { value: 'PRORATED', label: 'Prorated — only the unused time' },
            ]}
          />
        </div>
      )}

      <Text strong>Reason</Text>
      <Input.TextArea
        aria-label="Refund reason"
        style={{ marginTop: 8 }}
        rows={3}
        maxLength={500}
        placeholder="Why is this order refunded? (shown in the refund history)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        status={reason && !reasonValid ? 'error' : undefined}
      />
      {reason && !reasonValid && (
        <Text type="danger" style={{ fontSize: 12 }}>
          At least {MIN_REFUND_REASON} characters
        </Text>
      )}

      <Checkbox style={{ marginTop: 16 }} checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)}>
        Uang dikembalikan ke pengguna dan aksesnya dicabut sekarang
      </Checkbox>
    </Modal>
  );
}

const REFUND_SOURCE: Record<OrderRefund['source'], string> = {
  ADMIN: 'Backoffice',
  GOOGLE_VOIDED: 'Google (voided purchase)',
  GOOGLE_RTDN: 'Google (subscription revoked)',
};

const REFUND_STATUS_COLOR: Record<OrderRefund['status'], string> = {
  REQUESTED: 'orange',
  SUCCEEDED: 'green',
  FAILED: 'red',
};

// Google's voided-purchase codes, see purchases.voidedpurchases.
const VOIDED_SOURCE = ['User', 'Developer', 'Google'];
const VOIDED_REASON = [
  'Other',
  'Remorse',
  'Not received',
  'Defective',
  'Accidental purchase',
  'Fraud',
  'Friendly fraud',
  'Chargeback',
];

function RefundsDrawer({ order, onClose }: { order: Order; onClose: () => void }) {
  const queryClient = useQueryClient();
  const refundsKey = ['order-refunds', order.id];
  const { data, isLoading } = useQuery({
    queryKey: refundsKey,
    queryFn: () => ordersApi.refunds(order.id).then((r) => r.data),
  });

  const syncMutation = useMutation({
    mutationFn: (id: string) => orderRefundsApi.sync(id),
    onSuccess: () => {
      message.success('Refund details synced from Google');
      queryClient.invalidateQueries({ queryKey: refundsKey });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (err: unknown) => message.error(extractErrorMessage(err, 'Failed to sync refund')),
  });

  const money = (v: number | null, currency: string | null) =>
    v == null ? '—' : currency === 'IDR' || !currency ? formatIdr(v) : `${currency} ${v}`;

  return (
    <Drawer title={`Refunds — order ${order.id.slice(0, 8)}…`} open onClose={onClose} width={560}>
      {isLoading ? (
        <Spin />
      ) : !data?.length ? (
        <Empty description="No refunds" />
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          {data.map((r) => (
            <div key={r.id} data-testid="refund-record">
              {r.status === 'REQUESTED' && (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: 8 }}
                  message="Menunggu konfirmasi — Google accepted the refund but it isn't finalized here yet. Use Sync."
                />
              )}
              <Descriptions bordered column={1} size="small">
                <Descriptions.Item label="Status">
                  <Tag color={REFUND_STATUS_COLOR[r.status]}>{r.status}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Source">{REFUND_SOURCE[r.source]}</Descriptions.Item>
                {r.admin_email && <Descriptions.Item label="Admin">{r.admin_email}</Descriptions.Item>}
                {r.reason && <Descriptions.Item label="Reason">{r.reason}</Descriptions.Item>}
                <Descriptions.Item label="Type">
                  {r.refund_type === 'PRORATED' ? 'Prorated' : 'Full'}
                  {r.revoked ? ' · access revoked' : ''}
                </Descriptions.Item>
                <Descriptions.Item label="Order amount">{formatIdr(r.order_amount_idr)}</Descriptions.Item>
                <Descriptions.Item label="Refunded (Google)">
                  {money(r.refunded_total, r.currency)}
                  {r.refunded_tax != null && ` (tax ${money(r.refunded_tax, r.currency)})`}
                </Descriptions.Item>
                {r.play_order_state && (
                  <Descriptions.Item label="Google state">
                    {r.play_order_state}
                    {r.play_refund_reason && ` · ${r.play_refund_reason}`}
                  </Descriptions.Item>
                )}
                {r.voided_reason != null && (
                  <Descriptions.Item label="Voided">
                    {VOIDED_REASON[r.voided_reason] ?? r.voided_reason} by{' '}
                    {VOIDED_SOURCE[r.voided_source ?? -1] ?? r.voided_source}
                  </Descriptions.Item>
                )}
                {r.play_order_id && (
                  <Descriptions.Item label="Play order">
                    <Text copyable>{r.play_order_id}</Text>
                  </Descriptions.Item>
                )}
                <Descriptions.Item label="Requested">{new Date(r.requested_at).toLocaleString('id-ID')}</Descriptions.Item>
                {r.completed_at && (
                  <Descriptions.Item label="Completed">{new Date(r.completed_at).toLocaleString('id-ID')}</Descriptions.Item>
                )}
                {r.error && (
                  <Descriptions.Item label="Error">
                    <Text type={r.status === 'FAILED' ? 'danger' : 'secondary'}>{r.error}</Text>
                  </Descriptions.Item>
                )}
              </Descriptions>
              {r.play_order_id && r.status !== 'FAILED' && (
                <Button
                  size="small"
                  style={{ marginTop: 8 }}
                  icon={<SyncOutlined />}
                  loading={syncMutation.isPending && syncMutation.variables === r.id}
                  onClick={() => syncMutation.mutate(r.id)}
                >
                  Sync refund details
                </Button>
              )}
            </div>
          ))}
        </Space>
      )}
    </Drawer>
  );
}
