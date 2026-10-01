import { Tag, Typography } from 'antd';
import type { StrikeDisplay, StrikeOverride } from '../api/admin';
import { formatIdr, formatWib } from '../utils/strikePrice';

const { Text } = Typography;

/**
 * Table cell for a product/package's strike price: the effective strike
 * price right now (and when it ends), plus where it comes from — the item's
 * own override or the global rule.
 */
export default function StrikePriceCell({ item }: { item: StrikeOverride & StrikeDisplay }) {
  const source =
    item.strike_mode === 'NONE' ? (
      <Tag>Off for this item</Tag>
    ) : item.strike_mode ? (
      <Tag color="purple">Own promo</Tag>
    ) : (
      <Tag>Global</Tag>
    );

  if (item.strike_price_idr == null) {
    return (
      <div>
        <Text type="secondary">—</Text>
        <br />
        {source}
      </div>
    );
  }
  return (
    <div>
      <Text delete>{formatIdr(item.strike_price_idr)}</Text>{' '}
      {item.discount_percent != null && <Text type="danger">-{item.discount_percent}%</Text>}
      <br />
      {item.promo_ends_at && (
        <Text type="secondary" style={{ fontSize: 12 }}>
          s/d {formatWib(item.promo_ends_at)}
        </Text>
      )}
      <br />
      {source}
    </div>
  );
}
