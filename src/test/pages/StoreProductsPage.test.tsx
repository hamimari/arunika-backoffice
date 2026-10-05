import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import MockAdapter from 'axios-mock-adapter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '../../api/client';
import StoreProductsPage from '../../pages/store-products/StoreProductsPage';

const mock = new MockAdapter(api);
beforeEach(() => mock.reset());

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <StoreProductsPage />
    </QueryClientProvider>,
  );
}

const base = { max_cart_items: 20, max_cart_total_idr: 500000, price_step_idr: 1000 };
const product = {
  id: 'sp1',
  store: 'google',
  play_product_id: 'arunika.cart.t1000',
  price_idr: 1000,
  active: true,
  created_at: '2026-10-01T00:00:00Z',
};

describe('StoreProductsPage', () => {
  it('flags totals with no active product', async () => {
    mock.onGet('/admin/store-products').reply(200, { data: { ...base, products: [product], missing_totals: [77000] } });
    renderPage();

    expect(await screen.findByText('1 total belum punya produk aktif')).toBeInTheDocument();
    expect(screen.getByTestId('missing-totals')).toHaveTextContent('Rp 77.000');
    expect(screen.getByText('arunika.cart.t1000')).toBeInTheDocument();
  });

  it('says so when every total is covered', async () => {
    mock.onGet('/admin/store-products').reply(200, { data: { ...base, products: [product], missing_totals: [] } });
    renderPage();

    expect(await screen.findByText('Setiap total keranjang punya produk aktif.')).toBeInTheDocument();
  });
});
