import { Alert, Card, Col, Row, Spin, Statistic, Table, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { analyticsApi, type GrowthMetrics } from '../../api/analytics';

const categoryLabels = new Map<string, string>([
  ['normal', 'Normal'],
  ['stunted', 'Pendek'],
  ['severely_stunted', 'Sangat pendek'],
  ['tall', 'Tinggi'],
  ['underweight', 'Berat badan kurang'],
  ['severely_underweight', 'Berat badan sangat kurang'],
  ['risk_overweight', 'Risiko berat badan lebih'],
  ['out_of_range', 'Di atas 5 tahun'],
]);

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

interface DistributionRow {
  key: string;
  category: string;
  hfa: number;
  wfa: number;
}

function distributionRows(d: GrowthMetrics['category_distribution']): DistributionRow[] {
  const hfa = new Map(Object.entries(d.hfa));
  const wfa = new Map(Object.entries(d.wfa));
  return [...categoryLabels]
    .map(([key, category]) => ({ key, category, hfa: hfa.get(key) ?? 0, wfa: wfa.get(key) ?? 0 }))
    .filter((r) => r.hfa + r.wfa > 0);
}

/**
 * Tumbuh Kembang PRD metrics over the last [days] days. Aggregates
 * only: no backoffice screen shows an individual child's measurements.
 */
export default function GrowthMetricsCard({ days }: { days: number }) {
  const query = useQuery<GrowthMetrics>({
    queryKey: ['analytics', 'growth', days],
    queryFn: () => analyticsApi.getGrowth(days),
    retry: 1,
  });

  let body;
  if (query.isError) {
    body = <Alert type="error" message="Failed to load Tumbuh Kembang metrics" />;
  } else if (query.isLoading || !query.data) {
    body = (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <Spin />
      </div>
    );
  } else {
    const m = query.data;
    body = (
      <>
        <Row gutter={[16, 16]}>
          <Col xs={12} md={6}>
            <Statistic
              title="Activation"
              value={pct(m.activation_rate)}
              suffix={<Typography.Text type="secondary"> ({m.activated_parents} of {m.active_parents} parents)</Typography.Text>}
            />
          </Col>
          <Col xs={12} md={6}>
            <Statistic title="Habit (logged again within 45 days)" value={pct(m.habit_rate)} />
          </Col>
          <Col xs={12} md={6}>
            <Statistic
              title="Corrections per 100 measurements"
              value={m.corrections_per_100}
              formatter={(v) => Number(v).toFixed(1)}
            />
          </Col>
          <Col xs={12} md={6}>
            <Statistic title="Confirmed unusual values" value={pct(m.outlier_confirmed_share)} />
          </Col>
        </Row>
        <Typography.Title level={5} style={{ marginTop: 24 }}>
          Children by latest category
        </Typography.Title>
        <Table<DistributionRow>
          size="small"
          pagination={false}
          dataSource={distributionRows(m.category_distribution)}
          locale={{ emptyText: 'No measurements yet' }}
          columns={[
            { title: 'Category', dataIndex: 'category' },
            { title: 'Height (TB/U)', dataIndex: 'hfa', align: 'right' },
            { title: 'Weight (BB/U)', dataIndex: 'wfa', align: 'right' },
          ]}
        />
        <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
          {m.created_measurements} measurements created in this range. Retention lift and saves
          blocked by the unusual-value check are not tracked yet: they need app analytics events.
        </Typography.Paragraph>
      </>
    );
  }

  return <Card title={`Tumbuh Kembang (${days} days)`}>{body}</Card>;
}
