import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MockAdapter from 'axios-mock-adapter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '../../api/client';
import StrikePricePage from '../../pages/settings/StrikePricePage';

const mock = new MockAdapter(api);

beforeEach(() => mock.reset());
afterEach(() => mock.reset());

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <StrikePricePage />
    </QueryClientProvider>,
  );
}

const inTenDays = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString();

const rules = [
  { scope: 'AR_CARD', mode: 'NONE', value: 0, starts_at: null, ends_at: null, updated_at: '2026-09-01T00:00:00Z', status: 'OFF' },
  { scope: 'DONGENG', mode: 'NONE', value: 0, starts_at: null, ends_at: null, updated_at: '2026-09-01T00:00:00Z', status: 'OFF' },
  { scope: 'PACKAGE', mode: 'PERCENT', value: 20, starts_at: null, ends_at: inTenDays, updated_at: '2026-09-01T00:00:00Z', status: 'ACTIVE' },
];

async function card(scope: string) {
  return within(await screen.findByTestId(`strike-rule-${scope}`));
}

describe('StrikePricePage', () => {
  it('shows each scope with its status and a live preview', async () => {
    mock.onGet('/admin/strike-price-rules').reply(200, { data: rules });

    renderPage();

    const pkg = await card('PACKAGE');
    expect(pkg.getByText('Aktif')).toBeInTheDocument();
    // Example Rp 79.000 at 20% → Rp 99.000, -20%.
    await waitFor(() => expect(pkg.getByTestId('strike-preview')).toHaveTextContent('Rp 99.000'));
    expect(pkg.getByTestId('strike-preview')).toHaveTextContent('-20%');
    expect((await card('AR_CARD')).getByText('Nonaktif')).toBeInTheDocument();
  });

  it('saves a changed global rule', async () => {
    mock.onGet('/admin/strike-price-rules').reply(200, { data: rules });
    mock.onPut('/admin/strike-price-rules/PACKAGE').reply(200, { data: { ...rules[2], value: 25 } });
    const user = userEvent.setup();

    renderPage();

    const pkg = await card('PACKAGE');
    const value = await pkg.findByLabelText('Diskon (%)');
    await user.clear(value);
    await user.type(value, '25');
    await user.click(pkg.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mock.history.put.length).toBe(1));
    expect(JSON.parse(mock.history.put[0].data)).toEqual({
      mode: 'PERCENT',
      value: 25,
      starts_at: null,
      ends_at: inTenDays,
    });
  });

  it('requires an end date before a promo can be saved', async () => {
    mock.onGet('/admin/strike-price-rules').reply(200, { data: rules });
    const user = userEvent.setup();

    renderPage();

    const ar = await card('AR_CARD');
    await user.click(ar.getByLabelText('Mode'));
    await user.click(await screen.findByTitle('Nominal'));
    await user.type(await ar.findByLabelText('Tambahan nominal (Rp)'), '5000');
    await user.click(ar.getByRole('button', { name: 'Save' }));

    expect(await ar.findByText('End date is required for a promo')).toBeInTheDocument();
    expect(mock.history.put.length).toBe(0);
  });

  it('turns a promo off without needing a period', async () => {
    mock.onGet('/admin/strike-price-rules').reply(200, { data: rules });
    mock.onPut('/admin/strike-price-rules/PACKAGE').reply(200, { data: { ...rules[2], mode: 'NONE', status: 'OFF' } });
    const user = userEvent.setup();

    renderPage();

    const pkg = await card('PACKAGE');
    await user.click(pkg.getByLabelText('Mode'));
    // The PACKAGE card's dropdown is the one that just opened.
    const options = await screen.findAllByTitle('Tidak ada');
    await user.click(options[options.length - 1]);
    await user.click(pkg.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mock.history.put.length).toBe(1));
    expect(JSON.parse(mock.history.put[0].data)).toEqual({
      mode: 'NONE',
      value: 0,
      starts_at: null,
      ends_at: null,
    });
  });
});
