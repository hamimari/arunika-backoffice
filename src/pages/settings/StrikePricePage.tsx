import { Alert, Button, Card, Col, Form, Row, Spin, Tag, Typography, message } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { strikePriceApi } from '../../api/admin';
import type { StrikePriceRule, StrikeScope, StrikeMode } from '../../api/admin';
import StrikePriceFields from '../../components/StrikePriceFields';
import {
  STATUS_LABEL,
  formToOverride,
  formatWib,
  overrideToForm,
  type StrikeFormValues,
} from '../../utils/strikePrice';

const { Paragraph, Text } = Typography;

const QUERY_KEY = ['strike-price-rules'];

// Example prices only drive the preview; each item's own price is used in the app.
const SCOPES: { scope: StrikeScope; title: string; examplePrice: number }[] = [
  { scope: 'AR_CARD', title: 'Kartu AR', examplePrice: 15000 },
  { scope: 'DONGENG', title: 'Dongeng', examplePrice: 39000 },
  { scope: 'PACKAGE', title: 'Paket Premium', examplePrice: 79000 },
];

export default function StrikePricePage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => strikePriceApi.list().then((r) => r.data),
  });

  return (
    <>
      <h2>Harga Coret</h2>
      <Paragraph type="secondary">
        Show a crossed-out promotional price next to the real price in the app. The amount users pay
        never changes. Every promo needs an end date and can run for at most 90 days; it disappears
        automatically when it ends. A product or package can override these rules from its own edit
        form.
      </Paragraph>
      {isError && <Alert type="error" message="Failed to load strike price rules" style={{ marginBottom: 16 }} />}
      {isLoading ? (
        <Spin />
      ) : (
        <Row gutter={[16, 16]}>
          {SCOPES.map(({ scope, title, examplePrice }) => (
            <Col key={scope} xs={24} lg={8}>
              <RuleCard
                scope={scope}
                title={title}
                examplePrice={examplePrice}
                rule={data?.find((r) => r.scope === scope)}
              />
            </Col>
          ))}
        </Row>
      )}
    </>
  );
}

function RuleCard({
  scope,
  title,
  examplePrice,
  rule,
}: {
  scope: StrikeScope;
  title: string;
  examplePrice: number;
  rule: StrikePriceRule | undefined;
}) {
  const queryClient = useQueryClient();
  const [form] = Form.useForm<StrikeFormValues>();

  useEffect(() => {
    if (rule) {
      form.setFieldsValue(
        overrideToForm({
          strike_mode: rule.mode,
          strike_value: rule.mode === 'NONE' ? null : rule.value,
          strike_starts_at: rule.starts_at,
          strike_ends_at: rule.ends_at,
        }),
      );
    }
  }, [rule, form]);

  const saveMutation = useMutation({
    mutationFn: (values: StrikeFormValues) => {
      const o = formToOverride(values);
      return strikePriceApi.update(scope, {
        mode: (o.strike_mode ?? 'NONE') as StrikeMode,
        value: o.strike_value ?? 0,
        starts_at: o.strike_starts_at ?? null,
        ends_at: o.strike_ends_at ?? null,
      });
    },
    onSuccess: () => {
      message.success(`${title} saved`);
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      message.error(msg || `Failed to save ${title}`);
    },
  });

  const handleSave = async () => {
    let values: StrikeFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return; // antd shows the field errors inline
    }
    saveMutation.mutate(values);
  };

  const status = rule ? STATUS_LABEL[rule.status] : null;

  return (
    <Card
      title={title}
      extra={status && <Tag color={status.color}>{status.label}</Tag>}
      data-testid={`strike-rule-${scope}`}
    >
      {rule?.ends_at && rule.mode !== 'NONE' && (
        <Paragraph type="secondary" style={{ marginTop: -8 }}>
          <Text type="secondary">
            {rule.starts_at ? `${formatWib(rule.starts_at)} – ` : 'Until '}
            {formatWib(rule.ends_at)}
          </Text>
        </Paragraph>
      )}
      <Form form={form} layout="vertical">
        <StrikePriceFields price={examplePrice} label="Mode" />
      </Form>
      <Button type="primary" onClick={handleSave} loading={saveMutation.isPending} block>
        Save
      </Button>
    </Card>
  );
}
