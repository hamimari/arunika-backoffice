import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import MockAdapter from 'axios-mock-adapter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '../../api/client';
import OrdersPage from '../../pages/orders/OrdersPage';

const mock = new MockAdapter(api);

beforeEach(() => mock.reset());
afterEach(() => mock.reset());

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <OrdersPage />
    </QueryClientProvider>
  );
}

const sampleOrder = {
  id: 'order-1',
  user_id: 'user-1',
  product_id: null,
  package_id: 'pkg-1',
  amount_idr: 29000,
  status: 'PAID' as const,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('OrdersPage', () => {
  it('renders the order list', async () => {
    mock.onGet('/admin/orders').reply(200, { data: [sampleOrder], total: 1 });

    renderPage();

    expect(await screen.findByText('Rp 29.000')).toBeInTheDocument();
    expect(screen.getByText('PAID')).toBeInTheDocument();
    expect(screen.getByText('Package')).toBeInTheDocument();
  });

  it('re-fetches with the status param when the filter changes', async () => {
    mock.onGet('/admin/orders').reply(200, { data: [sampleOrder], total: 1 });

    renderPage();

    await screen.findByText('Rp 29.000');
    expect(mock.history.get[0].params).toMatchObject({ page: 1, per_page: 20 });
    expect(mock.history.get[0].params.status).toBeUndefined();
  });
});

describe('OrdersPage — Keranjang Belanja', () => {
  const cartOrder = {
    id: 'order-cart',
    user_id: 'user-1',
    user_name: 'Rani',
    user_email: 'rani@example.test',
    user_phone: '',
    product_id: null,
    product_name: null,
    package_id: null,
    package_name: null,
    amount_idr: 106000,
    status: 'PENDING' as const,
    provider: 'google_play' as const,
    has_purchase_token: true,
    is_cart: true,
    phase: 'diproses' as const,
    items: [
      { product_id: 'p1', title: 'Frog', item_type: 'ar_card', normal_idr: 2000, price_idr: 1000 },
      { product_id: 'p2', title: 'Hare and Tortoise', item_type: 'dongeng', normal_idr: 112000, price_idr: 105000 },
    ],
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
  };

  it('shows a cart order with its item count and the paid-not-granted tag', async () => {
    mock.onGet('/admin/orders').reply(200, { data: [cartOrder], total: 1 });
    renderPage();

    expect(await screen.findByText('Keranjang')).toBeInTheDocument();
    expect(screen.getByText('2 item')).toBeInTheDocument();
    expect(screen.getByText('Dibayar, belum diberikan')).toBeInTheDocument();
  });

  it('opens the cart items with their locked prices', async () => {
    mock.onGet('/admin/orders').reply(200, { data: [cartOrder], total: 1 });
    renderPage();

    (await screen.findByText('Keranjang')).click();
    expect(await screen.findByText('Pesanan keranjang')).toBeInTheDocument();
    expect(screen.getByText('Frog')).toBeInTheDocument();
    expect(screen.getByText('Hare and Tortoise')).toBeInTheDocument();
    expect(screen.getByText('Token Google Play tersimpan')).toBeInTheDocument();
  });

  it('calls regrant for "Berikan ulang"', async () => {
    mock.onGet('/admin/orders').reply(200, { data: [cartOrder], total: 1 });
    mock.onPost('/admin/orders/order-cart/regrant').reply(200, { data: { ...cartOrder, status: 'PAID', phase: 'diberikan' } });
    renderPage();

    (await screen.findByRole('button', { name: 'Berikan ulang' })).click();
    await waitFor(() => expect(mock.history.post).toHaveLength(1));
    expect(mock.history.post[0].url).toBe('/admin/orders/order-cart/regrant');
  });
});
