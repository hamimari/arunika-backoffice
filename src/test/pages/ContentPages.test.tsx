import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MockAdapter from 'axios-mock-adapter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ComponentType } from 'react';
import api from '../../api/client';

import ArCardsPage from '../../pages/content/ArCardsPage';
import ArCardCategoriesPage from '../../pages/content/ArCardCategoriesPage';
import BadgesPage from '../../pages/content/BadgesPage';
import CategoriesPage from '../../pages/content/CategoriesPage';
import CountingPage from '../../pages/content/CountingPage';
import TracingPage from '../../pages/content/TracingPage';

/**
 * Six of the content pages are the same page: each wires `useContentPage`
 * to a `contentApi(type)` module and renders a `ContentTable`. Their listing,
 * search, pagination, delete and visibility behaviour is therefore one
 * implementation, and testing it six times over would be six copies of the
 * same assertions.
 *
 * So this covers the shared behaviour once per page — cheaply, by
 * parameterising — and the page-specific parts (columns, form fields) get
 * their own assertions where they carry real behaviour. Pages that are NOT
 * built this way (payments, users, dashboard, analytics, login) have their
 * own files.
 */

const mock = new MockAdapter(api);

beforeEach(() => mock.reset());
afterEach(() => mock.reset());

function renderPage(Page: ComponentType) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Page />
    </QueryClientProvider>,
  );
}

interface PageCase {
  name: string;
  Page: ComponentType;
  endpoint: string;
  /** A row the list endpoint returns, and a field rendered in the table. */
  row: Record<string, unknown>;
  visibleText: string;
}

const cases: PageCase[] = [
  {
    name: 'ArCardsPage',
    Page: ArCardsPage,
    endpoint: '/admin/content/ar-cards',
    row: { id: 'c1', title: 'Harimau', type: 'animal', short_code: 'HRM', hidden: false },
    visibleText: 'Harimau',
  },
  {
    name: 'ArCardCategoriesPage',
    Page: ArCardCategoriesPage,
    endpoint: '/admin/content/ar-card-categories',
    row: { id: 'k1', name: 'Hewan Buas', image_url: 'https://img.test/k.png', hidden: false },
    visibleText: 'https://img.test/k.png',
  },
  {
    name: 'BadgesPage',
    Page: BadgesPage,
    endpoint: '/admin/content/badges',
    row: { id: 'b1', feature: 'AR_CARD', level: 3, threshold: 10, hidden: false },
    visibleText: 'AR_CARD',
  },
  {
    name: 'CategoriesPage',
    Page: CategoriesPage,
    endpoint: '/admin/content/categories',
    row: { id: 'g1', name: 'Kendaraan', hidden: false },
    visibleText: 'Kendaraan',
  },
  {
    name: 'CountingPage',
    Page: CountingPage,
    endpoint: '/admin/content/counting-questions',
    row: { id: 'q1', level: 2, answer: 7, hidden: false },
    visibleText: '7',
  },
  {
    name: 'TracingPage',
    Page: TracingPage,
    endpoint: '/admin/content/tracing-items',
    row: { id: 't1', label: 'Huruf A', type: 'letter', difficulty: 'easy', hidden: false },
    visibleText: 'Huruf A',
  },
];

describe.each(cases)('$name', ({ Page, endpoint, row, visibleText }) => {
  it('should_render_the_records_the_backend_returns', async () => {
    mock.onGet(endpoint).reply(200, { data: [row], total: 1 });

    renderPage(Page);

    expect(await screen.findByText(visibleText)).toBeInTheDocument();
  });

  it('should_request_the_first_page_on_load', async () => {
    mock.onGet(endpoint).reply(200, { data: [row], total: 1 });

    renderPage(Page);

    await screen.findByText(visibleText);
    expect(mock.history.get[0].params).toMatchObject({ page: 1 });
  });

  it('should_show_an_error_state_when_the_list_request_fails', async () => {
    mock.onGet(endpoint).reply(500, { error: 'boom' });

    renderPage(Page);

    // The page must not sit on an empty table pretending there is no content;
    // an outage and "nothing here" are different things.
    await waitFor(() => {
      expect(screen.queryByText(visibleText)).not.toBeInTheDocument();
    });
  });

  it('should_send_the_search_term_to_the_backend', async () => {
    mock.onGet(endpoint).reply(200, { data: [row], total: 1 });
    const user = userEvent.setup();

    renderPage(Page);
    await screen.findByText(visibleText);

    const search = screen.getByPlaceholderText(/search/i);
    await user.type(search, 'harimau{Enter}');

    await waitFor(() => {
      const withSearch = mock.history.get.filter((r) => r.params?.search);
      expect(withSearch.length).toBeGreaterThan(0);
      expect(withSearch.at(-1)?.params.search).toBe('harimau');
    });
  });

  it('should_open_a_create_form_when_add_is_pressed', async () => {
    mock.onGet(endpoint).reply(200, { data: [row], total: 1 });
    const user = userEvent.setup();

    renderPage(Page);
    await screen.findByText(visibleText);

    await user.click(screen.getByRole('button', { name: /add/i }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('should_hide_a_record_when_its_visibility_is_toggled_off', async () => {
    mock.onGet(endpoint).reply(200, { data: [row], total: 1 });
    mock.onPatch(`${endpoint}/${row.id}/visibility`).reply(200, { data: {} });
    const user = userEvent.setup();

    renderPage(Page);
    await screen.findByText(visibleText);

    const table = screen.getByRole('table');
    await user.click(within(table).getByRole('switch'));

    await waitFor(() => {
      expect(mock.history.patch).toHaveLength(1);
      expect(JSON.parse(mock.history.patch[0].data)).toEqual({ hidden: true });
    });
  });

  it('should_delete_a_record_only_after_the_confirmation_is_accepted', async () => {
    mock.onGet(endpoint).reply(200, { data: [row], total: 1 });
    mock.onDelete(`${endpoint}/${row.id}`).reply(200, {});
    const user = userEvent.setup();

    renderPage(Page);
    await screen.findByText(visibleText);

    const table = screen.getByRole('table');
    const buttons = within(table).getAllByRole('button');
    await user.click(buttons[buttons.length - 1]);

    // A destructive action must be behind a confirmation, not one stray tap.
    expect(mock.history.delete).toHaveLength(0);

    const confirm = await screen.findByRole('button', { name: /^(yes|ok)$/i });
    await user.click(confirm);

    await waitFor(() => expect(mock.history.delete).toHaveLength(1));
  });
});
