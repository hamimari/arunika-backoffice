import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MockAdapter from 'axios-mock-adapter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import api from '../../api/client';
import ArCardsPage from '../../pages/content/ArCardsPage';
import FairyTalesPage from '../../pages/content/FairyTalesPage';
import ProductsPage from '../../pages/products/ProductsPage';
import PremiumPackagesPage from '../../pages/packages/PremiumPackagesPage';

// Free / premium access for AR cards and dongeng: the Access column, the
// "Make free" / "Make premium" action, and the Access field of the forms.

const mock = new MockAdapter(api);

beforeEach(() => mock.reset());
afterEach(() => mock.reset());

function renderPage(page: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{page}</QueryClientProvider>);
}

const card = (over: Record<string, unknown>) => ({
  id: 'c-1', title: 'Harimau', type: 'animal', file_url: 'x', short_code: 'HRM',
  is_free: false, access: 'PAID', price_idr: 15000, ...over,
});

const rowOf = async (title: string) => (await screen.findByText(title)).closest('tr')!;

async function chooseAccess(user: ReturnType<typeof userEvent.setup>, option: 'Free' | 'Premium') {
  await user.click(screen.getByLabelText('Access'));
  await user.click(await screen.findByTitle(option));
}

describe('AR cards: Access column and actions', () => {
  it('shows each item\'s effective access', async () => {
    mock.onGet('/admin/content/ar-cards').reply(200, {
      total: 4,
      data: [
        card({ id: 'a', title: 'Paid card' }),
        card({ id: 'b', title: 'Flagged card', is_free: true, access: 'FREE' }),
        card({ id: 'c', title: 'No product card', access: 'FREE_NO_PRODUCT', price_idr: null }),
        card({ id: 'd', title: 'Withdrawn card', access: 'PAID_INACTIVE' }),
      ],
    });
    renderPage(<ArCardsPage />);

    expect(within(await rowOf('Paid card')).getByText('Paid')).toBeInTheDocument();
    expect(within(await rowOf('Flagged card')).getByText('Free')).toBeInTheDocument();
    expect(within(await rowOf('No product card')).getByText('Free (no product)')).toBeInTheDocument();
    expect(within(await rowOf('Withdrawn card')).getByText('Paid (withdrawn)')).toBeInTheDocument();
  });

  it('makes a paid card free through its own endpoint after confirming', async () => {
    mock.onGet('/admin/content/ar-cards').reply(200, { total: 1, data: [card({})] });
    mock.onPatch('/admin/content/ar-cards/c-1/free').reply(200, { is_free: true });
    const user = userEvent.setup();
    renderPage(<ArCardsPage />);

    await user.click(within(await rowOf('Harimau')).getByRole('button', { name: 'Make free' }));
    expect(mock.history.patch).toHaveLength(0); // not until confirmed
    expect(await screen.findByText(/product, orders and earlier buyers are kept/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Yes, make free' }));

    await waitFor(() => expect(mock.history.patch).toHaveLength(1));
    expect(JSON.parse(mock.history.patch[0].data)).toEqual({ is_free: true });
    expect(mock.history.put).toHaveLength(0);
  });

  it('offers Make premium for a free card and warns when it has no product', async () => {
    mock.onGet('/admin/content/ar-cards').reply(200, {
      total: 1,
      data: [card({ is_free: true, access: 'FREE_NO_PRODUCT', price_idr: null })],
    });
    mock.onPatch('/admin/content/ar-cards/c-1/free').reply(200, { is_free: false });
    const user = userEvent.setup();
    renderPage(<ArCardsPage />);

    await user.click(within(await rowOf('Harimau')).getByRole('button', { name: 'Make premium' }));
    expect(await screen.findByText(/stays free until you create one on the Products page/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Yes, make premium' }));

    await waitFor(() => expect(mock.history.patch).toHaveLength(1));
    expect(JSON.parse(mock.history.patch[0].data)).toEqual({ is_free: false });
  });
});

describe('AR cards: Access field', () => {
  it('defaults a new card to Free and sends it', async () => {
    mock.onGet('/admin/content/ar-cards').reply(200, { total: 0, data: [] });
    mock.onPost('/admin/content/ar-cards').reply(201, { data: { id: 'new' } });
    const user = userEvent.setup();
    renderPage(<ArCardsPage />);

    await user.click(await screen.findByRole('button', { name: /add new/i }));
    await user.type(await screen.findByLabelText('Title'), 'Singa');
    await user.click(screen.getByLabelText('Type'));
    await user.click(await screen.findByTitle('Animal'));
    await user.type(screen.getByLabelText('File URL'), 'https://cdn/singa.glb');
    expect(screen.getAllByText('Free').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => expect(mock.history.post).toHaveLength(1));
    expect(JSON.parse(mock.history.post[0].data).is_free).toBe(true);
  });

  it('hints that a product is needed when Premium is chosen for an item without one', async () => {
    mock.onGet('/admin/content/ar-cards').reply(200, { total: 0, data: [] });
    const user = userEvent.setup();
    renderPage(<ArCardsPage />);

    await user.click(await screen.findByRole('button', { name: /add new/i }));
    expect(screen.queryByText(/Create a product for this item/i)).not.toBeInTheDocument();
    await chooseAccess(user, 'Premium');

    expect(await screen.findByText(/Create a product for this item on the Products page/i)).toBeInTheDocument();
  });

  it('applies a changed Access through the free endpoint when editing, then saves', async () => {
    mock.onGet('/admin/content/ar-cards').reply(200, { total: 1, data: [card({})] });
    mock.onPatch('/admin/content/ar-cards/c-1/free').reply(200, { is_free: true });
    mock.onPut('/admin/content/ar-cards/c-1').reply(200, { data: { id: 'c-1' } });
    const user = userEvent.setup();
    renderPage(<ArCardsPage />);

    await user.click(within(await rowOf('Harimau')).getByRole('button', { name: /edit/i }));
    await chooseAccess(user, 'Free');
    await user.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => expect(mock.history.put).toHaveLength(1));
    expect(JSON.parse(mock.history.patch[0].data)).toEqual({ is_free: true });
    expect(mock.history.patch).toHaveLength(1);
  });

  it('does not call the free endpoint when Access is unchanged', async () => {
    mock.onGet('/admin/content/ar-cards').reply(200, { total: 1, data: [card({})] });
    mock.onPut('/admin/content/ar-cards/c-1').reply(200, { data: { id: 'c-1' } });
    const user = userEvent.setup();
    renderPage(<ArCardsPage />);

    await user.click(within(await rowOf('Harimau')).getByRole('button', { name: /edit/i }));
    await user.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => expect(mock.history.put).toHaveLength(1));
    expect(mock.history.patch).toHaveLength(0);
  });

  it('does not save the card when changing its access fails', async () => {
    mock.onGet('/admin/content/ar-cards').reply(200, { total: 1, data: [card({})] });
    mock.onPatch('/admin/content/ar-cards/c-1/free').reply(500);
    mock.onPut('/admin/content/ar-cards/c-1').reply(200, { data: { id: 'c-1' } });
    const user = userEvent.setup();
    renderPage(<ArCardsPage />);

    await user.click(within(await rowOf('Harimau')).getByRole('button', { name: /edit/i }));
    await chooseAccess(user, 'Free');
    await user.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => expect(mock.history.patch).toHaveLength(1));
    expect(mock.history.put).toHaveLength(0);
  });
});

describe('Dongeng: Access', () => {
  const tale = (over: Record<string, unknown>) => ({
    id: 'd-1', title: 'Kancil', image_url: 'x', audio_url: '', age_start: 3, age_end: 6,
    is_free: false, access: 'PAID', price_idr: 9000, category_id: null, ...over,
  });

  beforeEachStubs();

  it('shows access and makes a paid dongeng free', async () => {
    mock.onGet('/admin/content/fairy-tales').reply(200, { total: 1, data: [tale({})] });
    mock.onPatch('/admin/content/fairy-tales/d-1/free').reply(200, { is_free: true });
    const user = userEvent.setup();
    renderPage(<FairyTalesPage />);

    const row = await rowOf('Kancil');
    expect(within(row).getByText('Rp 9.000')).toBeInTheDocument();
    await user.click(within(row).getByRole('button', { name: 'Make free' }));
    await user.click(screen.getByRole('button', { name: 'Yes, make free' }));

    await waitFor(() => expect(mock.history.patch).toHaveLength(1));
    expect(JSON.parse(mock.history.patch[0].data)).toEqual({ is_free: true });
  });

  it('saves the Access chosen in the form with the dongeng itself', async () => {
    mock.onGet('/admin/content/fairy-tales').reply(200, { total: 1, data: [tale({})] });
    mock.onPut('/admin/content/fairy-tales/d-1').reply(200, { data: { id: 'd-1' } });
    const user = userEvent.setup();
    renderPage(<FairyTalesPage />);

    await user.click(within(await rowOf('Kancil')).getByRole('button', { name: /edit/i }));
    await chooseAccess(user, 'Free');
    await user.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => expect(mock.history.put).toHaveLength(1));
    expect(JSON.parse(mock.history.put[0].data).is_free).toBe(true);
    expect(mock.history.patch).toHaveLength(0);
  });

  it('defaults a new dongeng to Free', async () => {
    mock.onGet('/admin/content/fairy-tales').reply(200, { total: 0, data: [] });
    mock.onPost('/admin/content/fairy-tales').reply(201, { data: { id: 'n' } });
    const user = userEvent.setup();
    renderPage(<FairyTalesPage />);

    await user.click(await screen.findByRole('button', { name: /add new/i }));
    await user.type(await screen.findByLabelText('Title'), 'Baru');
    await user.type(screen.getByLabelText('Image URL'), 'https://img/x.png');
    await user.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => expect(mock.history.post).toHaveLength(1));
    expect(JSON.parse(mock.history.post[0].data).is_free).toBe(true);
  });
});

function beforeEachStubs() {
  beforeEach(() => {
    mock.onGet('/admin/content/categories').reply(200, { data: [], total: 0 });
    mock.onGet('/admin/content/dongeng-categories').reply(200, { data: [], total: 0 });
  });
}

describe('Products: Free override', () => {
  const product = (over: Record<string, unknown>) => ({
    id: 'prod-1', feature_id: 'f', feature_code: 'AR_CARD', display_name: 'Harimau',
    content_id: 'c-1', price_idr: 29000, is_active: true,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', ...over,
  });

  it('tags a product whose content is free, and only that one', async () => {
    mock.onGet('/admin/products').reply(200, {
      data: [
        product({ id: 'p-free', content_is_free: true }),
        product({ id: 'p-paid', content_is_free: false }),
      ],
    });
    renderPage(<ProductsPage />);

    await waitFor(() => expect(screen.getAllByText('Rp 29.000')).toHaveLength(2));
    expect(screen.getAllByText('Free override')).toHaveLength(1);
  });
});

describe('Packages: bundling a free item', () => {
  const pack = {
    id: 'pkg-1', name: 'Paket Hewan', subtitle: '', price_idr: 50000, type: 'content',
    is_active: true, is_best_value: false, sort_order: 1, badge_label: '', duration_days: null,
    play_product_id: null,
  };
  const prod = (id: string, name: string, free: boolean) => ({
    id, feature_id: 'f', feature_code: 'AR_CARD', display_name: name, content_id: id,
    price_idr: 10000, is_active: true, content_is_free: free,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  });

  it('warns when the selected product is currently free, and not for a paid one', async () => {
    mock.onGet('/admin/premium/packs').reply(200, { data: [pack] });
    mock.onGet('/admin/premium/packs/pkg-1/items').reply(200, { data: [] });
    mock.onGet('/admin/products').reply(200, {
      data: [prod('p-free', 'Kartu Gratis', true), prod('p-paid', 'Kartu Berbayar', false)],
    });
    const user = userEvent.setup();
    renderPage(<PremiumPackagesPage />);

    await user.click(await screen.findByRole('button', { name: /manage items/i }));
    const picker = await screen.findByRole('combobox');

    await user.click(picker);
    await user.click(await screen.findByText(/Kartu Berbayar/));
    expect(screen.queryByText(/currently free/i)).not.toBeInTheDocument();

    await user.click(picker);
    await user.click(await screen.findByText(/Kartu Gratis/));
    expect(await screen.findByText(/This item is currently free/i)).toBeInTheDocument();
  });

  it('tags an already bundled item that is currently free', async () => {
    mock.onGet('/admin/premium/packs').reply(200, { data: [pack] });
    mock.onGet('/admin/premium/packs/pkg-1/items').reply(200, {
      data: [{ package_id: 'pkg-1', product_id: 'p-free', created_at: '2026-01-01T00:00:00Z' }],
    });
    mock.onGet('/admin/products').reply(200, { data: [prod('p-free', 'Kartu Gratis', true)] });
    const user = userEvent.setup();
    renderPage(<PremiumPackagesPage />);

    await user.click(await screen.findByRole('button', { name: /manage items/i }));

    expect(await screen.findByText('Currently free')).toBeInTheDocument();
  });
});
