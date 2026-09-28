import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MockAdapter from 'axios-mock-adapter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '../../api/client';
import OrdersPage from '../../pages/orders/OrdersPage';

const mock = new MockAdapter(api);

beforeEach(() => mock.reset());
afterEach(() => mock.reset());

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <OrdersPage />
    </QueryClientProvider>,
  );
}

const base = {
  user_id: 'user-1',
  user_name: 'Budi',
  user_email: 'budi@example.test',
  user_phone: '0812',
  product_id: 'prod-1',
  product_name: 'Harimau',
  package_id: null,
  package_name: null,
  amount_idr: 25000,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
};
const playPaid = { ...base, id: 'order-play', status: 'PAID', provider: 'google_play', has_purchase_token: true };
const midtransPaid = { ...base, id: 'order-mid', status: 'PAID', provider: 'midtrans', has_purchase_token: false };
const refunded = {
  ...base,
  id: 'order-ref',
  status: 'REFUNDED',
  provider: 'google_play',
  has_purchase_token: true,
  refund_count: 1,
};
const subscription = {
  ...playPaid,
  id: 'order-sub',
  product_id: null,
  product_name: null,
  package_id: 'pkg-1',
  package_name: 'Bulanan',
  package_type: 'subscription',
};

const REASON = 'Pengguna salah beli kartu';

describe('OrdersPage — refunds', () => {
  it('offers Refund only on PAID Google Play orders with a purchase token', async () => {
    mock.onGet('/admin/orders').reply(200, { data: [playPaid, midtransPaid, refunded], total: 3 });

    renderPage();

    const refundButtons = await screen.findAllByRole('button', { name: /refund$/i });
    expect(refundButtons).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Refunds (1)' })).toBeInTheDocument();
  });

  it('needs a reason and the confirmation before refunding, then sends it', async () => {
    mock.onGet('/admin/orders').reply(200, { data: [playPaid], total: 1 });
    mock.onPost('/admin/orders/order-play/refund').reply(200, { data: { id: 'r1', status: 'SUCCEEDED' } });
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByRole('button', { name: /refund$/i }));
    const modal = await screen.findByRole('dialog');
    const submit = within(modal).getByRole('button', { name: 'Refund' });
    expect(submit).toBeDisabled();
    expect(within(modal).queryByText(/Refund type/)).not.toBeInTheDocument();

    await user.type(within(modal).getByLabelText('Refund reason'), 'salah');
    expect(within(modal).getByText('At least 10 characters')).toBeInTheDocument();
    await user.clear(within(modal).getByLabelText('Refund reason'));
    await user.type(within(modal).getByLabelText('Refund reason'), REASON);
    expect(submit).toBeDisabled();

    await user.click(within(modal).getByRole('checkbox'));
    expect(submit).toBeEnabled();
    await user.click(submit);

    await waitFor(() => expect(mock.history.post.length).toBe(1));
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ reason: REASON, refund_type: 'FULL' });
  });

  it('lets a subscription be refunded prorated', async () => {
    mock.onGet('/admin/orders').reply(200, { data: [subscription], total: 1 });
    mock.onPost('/admin/orders/order-sub/refund').reply(200, { data: { id: 'r1', status: 'SUCCEEDED' } });
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByRole('button', { name: /refund$/i }));
    const modal = await screen.findByRole('dialog');
    await user.click(within(modal).getByLabelText(/Prorated/));
    await user.type(within(modal).getByLabelText('Refund reason'), REASON);
    await user.click(within(modal).getByRole('checkbox'));
    await user.click(within(modal).getByRole('button', { name: 'Refund' }));

    await waitFor(() => expect(mock.history.post.length).toBe(1));
    expect(JSON.parse(mock.history.post[0].data)).toMatchObject({ refund_type: 'PRORATED' });
  });

  it("shows Google's error when the refund is refused", async () => {
    mock.onGet('/admin/orders').reply(200, { data: [playPaid], total: 1 });
    mock.onPost('/admin/orders/order-play/refund').reply(502, {
      error: 'google play refused the refund: refund not allowed',
    });
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByRole('button', { name: /refund$/i }));
    const modal = await screen.findByRole('dialog');
    await user.type(within(modal).getByLabelText('Refund reason'), REASON);
    await user.click(within(modal).getByRole('checkbox'));
    await user.click(within(modal).getByRole('button', { name: 'Refund' }));

    expect(await screen.findByText('google play refused the refund: refund not allowed')).toBeInTheDocument();
  });

  it('lists the refund history with who refunded, why and how much', async () => {
    mock.onGet('/admin/orders').reply(200, { data: [refunded], total: 1 });
    mock.onGet('/admin/orders/order-ref/refunds').reply(200, {
      data: [
        {
          id: 'r1',
          order_id: 'order-ref',
          source: 'ADMIN',
          refund_type: 'FULL',
          revoked: true,
          reason: REASON,
          admin_id: 'a1',
          admin_email: 'admin@arunika.id',
          play_order_id: 'GPA.1234',
          order_amount_idr: 25000,
          refunded_total: 25000,
          refunded_tax: 0,
          currency: 'IDR',
          play_order_state: 'REFUNDED',
          play_refund_reason: 'OTHER',
          voided_source: null,
          voided_reason: null,
          status: 'SUCCEEDED',
          error: null,
          requested_at: '2026-09-28T00:00:00Z',
          completed_at: '2026-09-28T00:00:01Z',
        },
      ],
    });
    mock.onPost('/admin/order-refunds/r1/sync').reply(200, { data: {} });
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Refunds (1)' }));
    const record = await screen.findByTestId('refund-record');
    expect(within(record).getByText('admin@arunika.id')).toBeInTheDocument();
    expect(within(record).getByText(REASON)).toBeInTheDocument();
    expect(within(record).getByText('Backoffice')).toBeInTheDocument();
    expect(within(record).getByText(/REFUNDED · OTHER/)).toBeInTheDocument();

    await user.click(within(record).getByRole('button', { name: /Sync refund details/ }));
    await waitFor(() => expect(mock.history.post.some((r) => r.url === '/admin/order-refunds/r1/sync')).toBe(true));
  });
});
