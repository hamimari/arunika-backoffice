import { Alert, Descriptions, Spin, Table, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { storeProductsApi } from '../../api/admin';
import type { StoreProduct } from '../../api/admin';

const { Text } = Typography;

const formatIdr = (v: number) => `Rp ${v.toLocaleString('id-ID')}`;

// Keranjang Belanja pays every cart with one consumable Google Play product
// whose price equals the cart total (arunika.cart.t<rupiah>). This page lists
// them and flags totals that have no active product: an order for such a
// total is refused with AMOUNT_UNAVAILABLE.
export default function StoreProductsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['store-products'],
    queryFn: () => storeProductsApi.coverage().then((r) => r.data),
  });

  if (isLoading || !data) return <Spin />;

  const missing = data.missing_totals;
  return (
    <>
      <h2>Produk toko</h2>
      <Descriptions bordered column={1} size="small" style={{ marginBottom: 16, maxWidth: 520 }}>
        <Descriptions.Item label="Produk aktif">{data.products.filter((p) => p.active).length}</Descriptions.Item>
        <Descriptions.Item label="Kelipatan harga">{formatIdr(data.price_step_idr)}</Descriptions.Item>
        <Descriptions.Item label="Maksimal keranjang">
          {data.max_cart_items} item · {formatIdr(data.max_cart_total_idr)}
        </Descriptions.Item>
      </Descriptions>
      {missing.length === 0 ? (
        <Alert type="success" showIcon style={{ marginBottom: 16 }} message="Setiap total keranjang punya produk aktif." />
      ) : (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={`${missing.length} total belum punya produk aktif`}
          description={
            <div data-testid="missing-totals">
              <Text>
                Pesanan dengan total ini akan ditolak. Jalankan <Text code>go run ./cmd/storeprices</Text> di backend.
              </Text>
              <div style={{ marginTop: 8 }}>
                {missing.slice(0, 50).map((t) => (
                  <Tag key={t}>{formatIdr(t)}</Tag>
                ))}
                {missing.length > 50 && <Text type="secondary">+{missing.length - 50} lainnya</Text>}
              </div>
            </div>
          }
        />
      )}
      <Table<StoreProduct>
        rowKey="id"
        size="small"
        dataSource={data.products}
        pagination={{ pageSize: 50, showSizeChanger: false }}
        columns={[
          { title: 'Play product ID', dataIndex: 'play_product_id', key: 'sku', render: (v: string) => <Text code>{v}</Text> },
          { title: 'Harga', dataIndex: 'price_idr', key: 'price', render: formatIdr },
          {
            title: 'Status',
            dataIndex: 'active',
            key: 'active',
            render: (v: boolean) => (v ? <Tag color="green">Aktif</Tag> : <Tag>Nonaktif</Tag>),
          },
        ]}
      />
    </>
  );
}
