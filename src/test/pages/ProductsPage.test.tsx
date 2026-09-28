import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MockAdapter from 'axios-mock-adapter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '../../api/client';
import ProductsPage from '../../pages/products/ProductsPage';

const mock = new MockAdapter(api);

beforeEach(() => mock.reset());
afterEach(() => mock.reset());

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProductsPage />
    </QueryClientProvider>
  );
}

describe('ProductsPage', () => {
  it('renders the product list', async () => {
    mock.onGet('/admin/products').reply(200, {
      data: [
        {
          id: 'prod-1',
          feature_id: 'feat-1',
          price_idr: 29000,
          is_active: true,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
    });

    renderPage();

    expect(await screen.findByText('Rp 29.000')).toBeInTheDocument();
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
  });

  it('shows an empty table when there are no products', async () => {
    mock.onGet('/admin/products').reply(200, { data: [] });

    renderPage();

    expect(await screen.findByText('Products')).toBeInTheDocument();
    expect(await screen.findByText('No data', { selector: 'div' })).toBeInTheDocument();
  });

  const inTwoWeeks = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString();
  const promoProduct = {
    id: 'prod-1',
    feature_id: 'feat-1',
    feature_code: 'AR_CARD',
    display_name: 'Harimau',
    content_id: 'card-1',
    price_idr: 15000,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    strike_mode: 'FIXED',
    strike_value: 5000,
    strike_ends_at: inTwoWeeks,
    strike_price_idr: 20000,
    discount_percent: 25,
    promo_ends_at: inTwoWeeks,
  };

  it('shows the effective strike price and where it comes from', async () => {
    mock.onGet('/admin/products').reply(200, {
      data: [
        promoProduct,
        { ...promoProduct, id: 'prod-2', strike_mode: undefined, strike_price_idr: null, discount_percent: null, promo_ends_at: null },
      ],
    });

    renderPage();

    expect(await screen.findByText('Rp 20.000')).toBeInTheDocument();
    expect(screen.getByText('-25%')).toBeInTheDocument();
    expect(screen.getByText('Own promo')).toBeInTheDocument();
    expect(screen.getByText('Global')).toBeInTheDocument();
  });

  it('saves the price together with the strike-price override', async () => {
    mock.onGet('/admin/products').reply(200, { data: [promoProduct] });
    mock.onPut('/admin/products/prod-1').reply(200, { data: promoProduct });
    const user = userEvent.setup();

    renderPage();

    await user.click(await screen.findByRole('button', { name: /edit/i }));
    const modal = await screen.findByRole('dialog');
    await waitFor(() => expect(within(modal).getByTestId('strike-preview')).toHaveTextContent('Rp 20.000'));
    await user.click(within(modal).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mock.history.put.length).toBe(1));
    expect(JSON.parse(mock.history.put[0].data)).toEqual({
      price_idr: 15000,
      strike_mode: 'FIXED',
      strike_value: 5000,
      strike_starts_at: null,
      strike_ends_at: inTwoWeeks,
    });
  });

  it('sends a null strike_mode when switching back to the global rule', async () => {
    mock.onGet('/admin/products').reply(200, { data: [promoProduct] });
    mock.onPut('/admin/products/prod-1').reply(200, { data: promoProduct });
    const user = userEvent.setup();

    renderPage();

    await user.click(await screen.findByRole('button', { name: /edit/i }));
    const modal = await screen.findByRole('dialog');
    await user.click(within(modal).getByLabelText('Harga coret'));
    await user.click(await screen.findByTitle('Ikuti global'));
    await user.click(within(modal).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mock.history.put.length).toBe(1));
    expect(JSON.parse(mock.history.put[0].data)).toMatchObject({ price_idr: 15000, strike_mode: null });
  });
});
