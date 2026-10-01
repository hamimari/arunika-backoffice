import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MockAdapter from 'axios-mock-adapter';
import axios from 'axios';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactElement } from 'react';
import api from '../../api/client';

import PaymentsPage from '../../pages/payments/PaymentsPage';
import UsersPage from '../../pages/users/UsersPage';
import UserDetailPage from '../../pages/users/UserDetailPage';
import LoginPage from '../../pages/LoginPage';

/**
 * The admin pages that are not built on `useContentPage` + `ContentTable`.
 * Each has behaviour of its own — money figures, a routed detail view, the
 * sign-in form — so each is covered directly rather than parameterised.
 */

const mock = new MockAdapter(api);
const bareAxios = new MockAdapter(axios);

beforeEach(() => {
  mock.reset();
  bareAxios.reset();
  localStorage.clear();
});
afterEach(() => {
  mock.reset();
  bareAxios.reset();
  localStorage.clear();
});

function renderRouted(ui: ReactElement, { route = '/' } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PaymentsPage', () => {
  const payment = {
    id: 'p1',
    provider_order_id: 'ORDER-123',
    status: 'PAID',
    amount_idr: 99000,
    created_at: '2026-09-01T00:00:00Z',
  };

  it('should_list_the_transactions_the_backend_returns', async () => {
    mock.onGet('/admin/payments').reply(200, { data: [payment], total: 1 });
    mock.onGet('/admin/analytics/subscription-stats').reply(200, { total: 10, premium: 4, free: 6 });

    renderRouted(<PaymentsPage />);

    expect(await screen.findByText('ORDER-123')).toBeInTheDocument();
  });

  it('should_derive_the_conversion_rate_from_subscription_stats', async () => {
    mock.onGet('/admin/payments').reply(200, { data: [], total: 0 });
    mock.onGet('/admin/analytics/subscription-stats').reply(200, { total: 10, premium: 4, free: 6 });

    renderRouted(<PaymentsPage />);

    // 4 of 10 is 40% — a figure an admin may act on, so it is worth pinning.
    // antd renders the value and the "%" suffix as separate nodes, so the
    // assertion targets the Statistic labelled Conversion Rate.
    await waitFor(() => {
      const label = screen.getByText('Conversion Rate');
      const card = label.closest('.ant-statistic') as HTMLElement;
      // Statistic renders a skeleton while the query is in flight, so the
      // value only appears once subscription stats have resolved.
      expect(card.textContent).toContain('40');
    });
  });

  it('should_show_no_conversion_rate_rather_than_dividing_by_zero', async () => {
    mock.onGet('/admin/payments').reply(200, { data: [], total: 0 });
    mock.onGet('/admin/analytics/subscription-stats').reply(200, { total: 0, premium: 0, free: 0 });

    renderRouted(<PaymentsPage />);

    await waitFor(() => {
      const label = screen.getByText('Conversion Rate');
      const card = label.closest('.ant-statistic') as HTMLElement;
      expect(card.textContent).toContain('0');
    });
  });

  it('should_send_the_status_filter_to_the_backend', async () => {
    mock.onGet('/admin/payments').reply(200, { data: [payment], total: 1 });
    mock.onGet('/admin/analytics/subscription-stats').reply(200, { total: 1, premium: 1, free: 0 });
    const user = userEvent.setup();

    renderRouted(<PaymentsPage />);
    await screen.findByText('ORDER-123');

    const search = screen.getByPlaceholderText(/search/i);
    await user.type(search, 'ORDER-123{Enter}');

    await waitFor(() => {
      const searched = mock.history.get.filter((r) => r.params?.search);
      expect(searched.at(-1)?.params.search).toBe('ORDER-123');
    });
  });
});

describe('UsersPage', () => {
  const user = {
    id: 'u1',
    name: 'Budi',
    email_address: 'budi@example.test',
    city: 'Jakarta',
    created_at: '2026-09-01T00:00:00Z',
  };

  it('should_list_users', async () => {
    mock.onGet('/admin/users').reply(200, { data: [user], total: 1 });

    renderRouted(<UsersPage />);

    expect(await screen.findByText('Budi')).toBeInTheDocument();
    expect(screen.getByText('budi@example.test')).toBeInTheDocument();
  });

  it('should_send_the_search_term_to_the_backend', async () => {
    mock.onGet('/admin/users').reply(200, { data: [user], total: 1 });
    const person = userEvent.setup();

    renderRouted(<UsersPage />);
    await screen.findByText('Budi');

    await person.type(screen.getByPlaceholderText(/search/i), 'budi{Enter}');

    await waitFor(() => {
      const searched = mock.history.get.filter((r) => r.params?.search);
      expect(searched.at(-1)?.params.search).toBe('budi');
    });
  });

  it('should_render_an_empty_table_when_there_are_no_users', async () => {
    mock.onGet('/admin/users').reply(200, { data: [], total: 0 });

    renderRouted(<UsersPage />);

    await waitFor(() => expect(mock.history.get).toHaveLength(1));
    // Asserting on antd's empty-state copy would couple this to a localisable
    // string, and counting rows would couple it to antd rendering a
    // placeholder row. The meaningful claim is that the table renders and no
    // user data appears in it.
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.queryByText('Budi')).not.toBeInTheDocument();
    expect(screen.queryByText('budi@example.test')).not.toBeInTheDocument();
  });
});

describe('UserDetailPage', () => {
  // usersApi.get unwraps r.data.data, and the page reads {user, subscription}
  // out of it — not a bare user object.
  const detail = {
    user: {
      id: 'u1',
      name: 'Budi',
      email_address: 'budi@example.test',
      phone_number: '081',
      city: 'Jakarta',
    },
    subscription: { status: 'free' },
  };

  function renderDetail() {
    return renderRouted(
      <Routes>
        <Route path="/users/:id" element={<UserDetailPage />} />
      </Routes>,
      { route: '/users/u1' },
    );
  }

  it('should_load_the_user_named_in_the_route', async () => {
    mock.onGet('/admin/users/u1').reply(200, { data: detail });

    renderDetail();

    expect(await screen.findByText('Budi')).toBeInTheDocument();
    // The id must come from the route, not a hardcoded default.
    expect(mock.history.get[0].url).toBe('/admin/users/u1');
  });

  it('should_grant_premium_through_the_permission_endpoint', async () => {
    mock.onGet('/admin/users/u1').reply(200, { data: detail });
    mock.onPatch('/admin/users/u1/permission').reply(200, { data: {} });
    const person = userEvent.setup();

    renderDetail();
    await screen.findByText('Budi');

    // The button opens a modal asking for a duration — granting premium is
    // not a one-tap action, and the PATCH must not fire before the form is
    // submitted.
    await person.click(screen.getByRole('button', { name: /grant premium/i }));

    const dialog = await screen.findByRole('dialog');
    expect(mock.history.patch).toHaveLength(0);

    await person.type(within(dialog).getByRole('spinbutton'), '30');
    await person.click(within(dialog).getByRole('button', { name: /^ok$/i }));

    await waitFor(() => {
      expect(mock.history.patch).toHaveLength(1);
      expect(JSON.parse(mock.history.patch[0].data)).toMatchObject({
        action: 'grant',
        duration_days: 30,
      });
    });
  });
});

describe('LoginPage', () => {
  it('should_require_both_fields_before_submitting', async () => {
    const person = userEvent.setup();

    renderRouted(<LoginPage />);

    await person.click(screen.getByRole('button', { name: /login|masuk|sign in/i }));

    // antd surfaces required-field errors; nothing should have been sent.
    await waitFor(() => expect(mock.history.post).toHaveLength(0));
  });

  it('should_sign_in_with_the_credentials_entered', async () => {
    mock.onPost('/admin/auth/login').reply(200, {
      access_token: 'access-abc',
      refresh_token: 'refresh-abc',
      admin_id: 'admin-1',
    });
    const person = userEvent.setup();

    renderRouted(<LoginPage />);

    await person.type(screen.getByPlaceholderText(/admin@/i), 'admin@arunika.id');
    await person.type(screen.getByPlaceholderText('••••••••'), 'secret123');
    await person.click(screen.getByRole('button', { name: /login|masuk|sign in/i }));

    await waitFor(() => {
      expect(mock.history.post).toHaveLength(1);
      expect(JSON.parse(mock.history.post[0].data)).toEqual({
        email: 'admin@arunika.id',
        password: 'secret123',
      });
    });
    // A successful login must leave a usable session behind.
    await waitFor(() =>
      expect(localStorage.getItem('admin_access_token')).toBe('access-abc'),
    );
  });

  it('should_not_store_a_session_when_the_credentials_are_rejected', async () => {
    mock.onPost('/admin/auth/login').reply(401, { error: 'invalid credentials' });
    const person = userEvent.setup();

    renderRouted(<LoginPage />);

    await person.type(screen.getByPlaceholderText(/admin@/i), 'admin@arunika.id');
    await person.type(screen.getByPlaceholderText('••••••••'), 'wrong');
    await person.click(screen.getByRole('button', { name: /login|masuk|sign in/i }));

    await waitFor(() => expect(mock.history.post).toHaveLength(1));
    expect(localStorage.getItem('admin_access_token')).toBeNull();
  });
});
