import { Tag, Typography } from 'antd';

/** Effective access of an AR card / dongeng, computed by the backend. */
export type Access = 'FREE' | 'FREE_NO_PRODUCT' | 'PAID' | 'PAID_INACTIVE';

interface AccessItem {
  access?: Access;
  /** The linked product's price, present whenever a product exists. */
  price_idr?: number | null;
}

const formatIdr = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;

/**
 * Shows whether an item is free or paid. A flagged-free item that still has a
 * product shows that product's price too, so the admin can see what it was
 * sold for before it was made free.
 */
export default function AccessCell({ item }: { item: AccessItem }) {
  const price = item.price_idr != null ? formatIdr(item.price_idr) : null;
  switch (item.access) {
    case 'FREE':
      return (
        <div>
          <Tag color="green">Free</Tag>
          {price && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              was {price}
            </Typography.Text>
          )}
        </div>
      );
    case 'FREE_NO_PRODUCT':
      return <Tag>Free (no product)</Tag>;
    case 'PAID':
      return (
        <div>
          <Tag color="gold">Paid</Tag>
          {price && <Typography.Text style={{ fontSize: 12 }}>{price}</Typography.Text>}
        </div>
      );
    case 'PAID_INACTIVE':
      return (
        <div>
          <Tag color="default">Paid (withdrawn)</Tag>
          {price && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {price}
            </Typography.Text>
          )}
        </div>
      );
    default:
      return <>—</>;
  }
}
