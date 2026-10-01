import { Alert, Form, Select } from 'antd';

/**
 * The "Access" (Free / Premium) field of the AR card and dongeng forms, bound
 * to `is_free`. Choosing Premium for an item with no product shows a hint,
 * because nothing can be sold until a product exists for it.
 */
export default function AccessField({ hasProduct }: { hasProduct: boolean }) {
  const form = Form.useFormInstance();
  const isFree = Form.useWatch('is_free', form);

  return (
    <>
      <Form.Item name="is_free" label="Access">
        <Select
          options={[
            { value: true, label: 'Free' },
            { value: false, label: 'Premium' },
          ]}
        />
      </Form.Item>
      {isFree === false && !hasProduct && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Create a product for this item on the Products page before it can be sold. Until then it stays free."
        />
      )}
    </>
  );
}
