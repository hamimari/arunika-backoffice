import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import MockAdapter from 'axios-mock-adapter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '../../api/client';
import GrowthMetricsCard from '../../pages/dashboard/GrowthMetricsCard';

const mock = new MockAdapter(api);

beforeEach(() => mock.reset());
afterEach(() => mock.reset());

function renderCard(days = 30) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <GrowthMetricsCard days={days} />
    </QueryClientProvider>,
  );
}

const metrics = {
  days: 30,
  active_parents: 200,
  activated_parents: 50,
  activation_rate: 0.25,
  habit_rate: 0.4,
  created_measurements: 80,
  corrections_per_100: 6.25,
  outlier_confirmed_share: 0.0125,
  category_distribution: {
    hfa: { normal: 40, stunted: 6 },
    wfa: { normal: 38, risk_overweight: 5 },
  },
};

describe('GrowthMetricsCard', () => {
  it('shows the PRD metrics and the category distribution', async () => {
    mock.onGet('/admin/analytics/growth').reply(200, { data: metrics });
    renderCard();

    expect(await screen.findByText('25.0%')).toBeInTheDocument();
    expect(screen.getByText('40.0%')).toBeInTheDocument();
    expect(screen.getByText('6.3')).toBeInTheDocument();
    expect(screen.getByText('1.3%')).toBeInTheDocument();
    expect(screen.getByText('Pendek')).toBeInTheDocument();
    expect(screen.getByText('Risiko berat badan lebih')).toBeInTheDocument();
    expect(screen.getByText(/not tracked yet/)).toBeInTheDocument();
  });

  it('handles no measurements without errors', async () => {
    mock.onGet('/admin/analytics/growth').reply(200, {
      data: {
        ...metrics,
        activated_parents: 0,
        activation_rate: 0,
        habit_rate: 0,
        created_measurements: 0,
        corrections_per_100: 0,
        outlier_confirmed_share: 0,
        category_distribution: { hfa: {}, wfa: {} },
      },
    });
    renderCard();
    expect(await screen.findByText('No measurements yet')).toBeInTheDocument();
  });

  it('requests the selected day range', async () => {
    mock.onGet('/admin/analytics/growth').reply(200, { data: metrics });
    renderCard(7);
    await waitFor(() => expect(mock.history.get[0]?.params).toMatchObject({ days: 7 }));
  });

  it('shows an error when the metrics cannot load', async () => {
    mock.onGet('/admin/analytics/growth').reply(500);
    renderCard();
    expect(await screen.findByText('Failed to load Tumbuh Kembang metrics')).toBeInTheDocument();
  });
});
