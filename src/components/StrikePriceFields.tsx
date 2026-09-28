import { DatePicker, Form, InputNumber, Select, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import {
  INHERIT,
  computeStrikePrice,
  formatIdr,
  formatWib,
  validatePromoPeriod,
  type StrikeModeChoice,
} from '../utils/strikePrice';

const { Text } = Typography;

interface Props {
  /** Real price the preview is computed from (the item's price, or an example). */
  price: number | null | undefined;
  /** Offer "Ikuti global" — for per-item overrides, not for the global rules. */
  allowInherit?: boolean;
  /** Field label for the mode select. */
  label?: string;
}

/**
 * Strike-price ("harga coret") fields for use inside an antd Form: mode,
 * value and promo period, plus a live preview. Field names are strike_mode,
 * strike_value and strike_period (see utils/strikePrice for conversion).
 */
export default function StrikePriceFields({ price, allowInherit = false, label = 'Harga coret' }: Props) {
  const form = Form.useFormInstance();
  const mode = Form.useWatch('strike_mode', form) as StrikeModeChoice | undefined;
  const value = Form.useWatch('strike_value', form) as number | null | undefined;
  const period = Form.useWatch('strike_period', form) as [Dayjs | null, Dayjs | null] | null | undefined;

  const isPromo = mode === 'PERCENT' || mode === 'FIXED';
  const preview = isPromo && price ? computeStrikePrice(price, mode, value) : null;
  const end = period?.[1] ?? null;

  const options = [
    ...(allowInherit ? [{ value: INHERIT, label: 'Ikuti global' }] : []),
    { value: 'NONE', label: 'Tidak ada' },
    { value: 'PERCENT', label: 'Persen' },
    { value: 'FIXED', label: 'Nominal' },
  ];

  return (
    <>
      <Form.Item
        name="strike_mode"
        label={label}
        initialValue={allowInherit ? INHERIT : 'NONE'}
        extra="Display-only crossed-out price. The amount charged never changes."
      >
        <Select options={options} aria-label={label} />
      </Form.Item>

      {isPromo && (
        <>
          <Form.Item
            name="strike_value"
            label={mode === 'PERCENT' ? 'Diskon (%)' : 'Tambahan nominal (Rp)'}
            rules={[
              { required: true, message: 'Value is required' },
              mode === 'PERCENT'
                ? { type: 'number', min: 1, max: 90, message: 'Percent must be between 1 and 90' }
                : { type: 'number', min: 1, message: 'Amount must be at least 1' },
            ]}
          >
            <InputNumber
              style={{ width: '100%' }}
              min={1}
              max={mode === 'PERCENT' ? 90 : undefined}
              precision={0}
              aria-label={mode === 'PERCENT' ? 'Diskon (%)' : 'Tambahan nominal (Rp)'}
            />
          </Form.Item>

          <Form.Item
            name="strike_period"
            label="Periode promo"
            extra={`Start is optional (starts immediately). The promo can run for at most 90 days.`}
            rules={[
              {
                validator: (_, v: [Dayjs | null, Dayjs | null] | null | undefined) => {
                  const error = validatePromoPeriod(v?.[0] ?? null, v?.[1] ?? null);
                  return error ? Promise.reject(new Error(error)) : Promise.resolve();
                },
              },
            ]}
          >
            <DatePicker.RangePicker
              showTime={{ format: 'HH:mm' }}
              format="DD MMM YYYY HH:mm"
              allowEmpty={[true, false]}
              needConfirm={false}
              placeholder={['Mulai (opsional)', 'Berakhir']}
              style={{ width: '100%' }}
            />
          </Form.Item>

          <div data-testid="strike-preview" style={{ marginTop: -8, marginBottom: 16 }}>
            {preview && price ? (
              <Text>
                {formatIdr(price)} → <Text delete>{formatIdr(preview.strike)}</Text>{' '}
                <Text type="danger">-{preview.discountPercent}%</Text>
                {end && <Text type="secondary"> · s/d {formatWib(end.toDate())}</Text>}
              </Text>
            ) : (
              <Text type="secondary">Enter a value to preview the strike price.</Text>
            )}
          </div>
        </>
      )}
    </>
  );
}
