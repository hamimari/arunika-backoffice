import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MockAdapter from 'axios-mock-adapter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '../../api/client';
import FairyTalesPage from '../../pages/content/FairyTalesPage';
import { loadImageSize } from '../../lib/pageImage';

// jsdom never loads images, so the browser load is faked per URL.
vi.mock('../../lib/pageImage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/pageImage')>()),
  loadImageSize: vi.fn(),
}));

const sizes = new Map([
  ['https://cdn.example.com/kelinci.png', { width: 1408, height: 768 }],
  ['https://cdn.example.com/kancil-1.jpeg', { width: 2400, height: 1792 }],
  ['https://cdn.example.com/small.png', { width: 960, height: 540 }],
]);

const mock = new MockAdapter(api);

beforeEach(() => {
  mock.reset();
  vi.mocked(loadImageSize).mockReset().mockImplementation(async (url) => {
    const size = sizes.get(url);
    if (!size) throw new Error('load failed');
    return size;
  });
  mock.onGet('/admin/content/fairy-tales').reply(200, {
    data: [{ id: 'd-1', title: 'Kancil', image_url: '', audio_url: '', age_start: 3, age_end: 6, is_free: true }],
    total: 1,
  });
  mock.onGet('/admin/content/categories').reply(200, { data: [], total: 0 });
  mock.onGet('/admin/content/dongeng-categories').reply(200, { data: [], total: 0 });
  mock.onGet('/admin/content/dongen-pages').reply(200, { data: [] });
  mock.onPost('/admin/content/dongen-pages').reply(201, { data: { id: 'p-1' } });
});
afterEach(() => mock.reset());

async function openAddPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <FairyTalesPage />
    </QueryClientProvider>
  );
  const user = userEvent.setup();
  const row = (await screen.findByText('Kancil')).closest('tr')!;
  await user.click(within(row).getByRole('button', { name: /expand row/i }));
  await user.click(await screen.findByRole('button', { name: /add page/i }));
  const dialog = await screen.findByRole('dialog');
  return { user, dialog };
}

async function saveWithImage(url: string) {
  const { user, dialog } = await openAddPage();
  if (url) await user.type(within(dialog).getByLabelText('Image URL'), url);
  await user.click(within(dialog).getByRole('button', { name: 'OK' }));
  return dialog;
}

describe('Fairy tale page image check', () => {
  it('saves a correctly shaped image', async () => {
    await saveWithImage('https://cdn.example.com/kelinci.png');

    await waitFor(() => expect(mock.history.post.length).toBe(1));
    expect(JSON.parse(mock.history.post[0].data).image_url).toBe('https://cdn.example.com/kelinci.png');
  });

  it('blocks a 4:3 image and says why', async () => {
    const dialog = await saveWithImage('https://cdn.example.com/kancil-1.jpeg');

    expect(await within(dialog).findByText(/2400×1792: too tall/)).toBeInTheDocument();
    expect(mock.history.post.length).toBe(0);
  });

  it('blocks an image narrower than 1280 px', async () => {
    const dialog = await saveWithImage('https://cdn.example.com/small.png');

    expect(await within(dialog).findByText(/960×540: it must be at least 1280 px wide/)).toBeInTheDocument();
    expect(mock.history.post.length).toBe(0);
  });

  it('blocks an image that fails to load', async () => {
    const dialog = await saveWithImage('https://cdn.example.com/missing.png');

    expect(await within(dialog).findByText(/Could not load this image/)).toBeInTheDocument();
    expect(mock.history.post.length).toBe(0);
  });

  it('saves a page with no image without checking', async () => {
    await saveWithImage('');

    await waitFor(() => expect(mock.history.post.length).toBe(1));
    expect(loadImageSize).not.toHaveBeenCalled();
  });

  it('shows the size and the cropped bands once the image loads', async () => {
    const { user, dialog } = await openAddPage();
    await user.type(within(dialog).getByLabelText('Image URL'), 'https://cdn.example.com/kancil-1.jpeg');

    const preview = await within(dialog).findByTestId('page-image-preview');
    expect(within(preview).getByText(/2400 × 1792/)).toBeInTheDocument();
    // 2:1 screen shows 1200 of 1792 rows: ~16.5% is cut from each edge.
    expect(within(preview).getByTestId('crop-band-top').style.height).toMatch(/^16\.5/);
  });
});
