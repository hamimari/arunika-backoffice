import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MockAdapter from 'axios-mock-adapter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Modal } from 'antd';
import api from '../../api/client';
import type { HurufDraft, HurufLetterRow } from '../../api/huruf';
import { useAuthStore } from '../../store/authStore';
import HurufListPage from '../../pages/huruf/HurufListPage';
import HurufEditorPage from '../../pages/huruf/HurufEditorPage';
import RolesPage from '../../pages/settings/RolesPage';
import { AUTOSAVE_MS, fieldErrorText, statusGroup, urlWarning } from '../../pages/huruf/hurufUtils';

const mock = new MockAdapter(api);

beforeEach(() => {
  mock.reset();
  useAuthStore.setState({ role: 'publisher' });
});
afterEach(() => {
  mock.reset();
  vi.useRealTimers();
  // Modal.confirm renders outside the test's tree; don't leak it.
  Modal.destroyAll();
});

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/huruf" element={<HurufListPage />} />
          <Route path="/huruf/:id" element={<HurufEditorPage />} />
          <Route path="/settings/roles" element={<RolesPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const row = (upper: string, over: Partial<HurufLetterRow> = {}): HurufLetterRow => ({
  id: `id-${upper}`,
  upper,
  lower: upper.toLowerCase(),
  sort_order: upper.charCodeAt(0) - 64,
  is_free: upper === 'A',
  status: 'published',
  has_unpublished_changes: false,
  version: 1,
  word: `${upper}word`,
  image_url: '',
  audio_count: 2,
  stroke_count: 3,
  updated_by: 'tim@arunika.id',
  updated_at: '2026-09-30T03:42:00Z',
  ...over,
});

const letters = [
  row('A', { has_unpublished_changes: true, version: 3, word: 'Apel' }),
  row('B', { word: 'Bola', version: 2 }),
  row('D', { status: 'draft', version: null, word: 'Domba', audio_count: 1 }),
  row('H', { status: 'hidden', word: 'Harimau' }),
];

const draft = (over: Partial<HurufDraft> = {}): HurufDraft => ({
  ...row('A', { has_unpublished_changes: false, version: 3, word: 'Apel' }),
  draft_rev: 7,
  draft: {
    upper: 'A',
    lower: 'a',
    kenali: { word: 'Apel', highlight: [0], image_asset_id: 'img' },
    dengar: { letter_audio_id: 'a1', word_audio_id: null },
    tebalkan: {
      grid: 300,
      lower_required: false,
      upper: [{ order: 1, label: 'Garis miring kiri', path: 'M150 30 L70 260' }],
      lower: [],
    },
    feedback: { success: 'Keren! Huruf A rapi!', retry: 'Belum pas, ayo lagi!', hint: 'Mulai dari angka 1' },
  },
  assets: {
    img: {
      id: 'img', kind: 'image', url: 'https://media.test/apel.webp', mime: 'image/webp',
      bytes: 180000, width: 512, height: 512, duration_ms: null, original_name: 'apel.webp',
    },
    a1: {
      id: 'a1', kind: 'audio', url: 'https://media.test/a.mp3', mime: 'audio/mpeg',
      bytes: 20000, width: null, height: null, duration_ms: 1200, original_name: 'a.mp3',
    },
  },
  ...over,
});

describe('helpers', () => {
  it('groups statuses for the tabs', () => {
    expect(letters.map(statusGroup)).toEqual(['published', 'published', 'draft', 'hidden']);
  });
  it('words publish errors in Indonesian', () => {
    expect(fieldErrorText({ path: 'kenali.highlight', code: 'INVALID' }, 'A')).toBe(
      'Huruf yang disorot harus huruf A',
    );
    expect(fieldErrorText({ path: 'x', code: 'REQUIRED' }, 'A')).toMatch(/Wajib/);
    expect(fieldErrorText({ path: 'x', code: 'ORDER_INVALID' }, 'A')).toMatch(/Urutan/);
    expect(fieldErrorText({ path: 'x', code: 'SOMETHING' }, 'A')).toBe('SOMETHING');
    expect(fieldErrorText({ path: 'x', code: 'INVALID_URL' }, 'A')).toMatch(/https/);
  });
  it('warns about media URLs the app could not load', () => {
    expect(urlWarning('https://media.haloarunika.com/huruf/a.mp3')).toBeNull();
    expect(urlWarning('http://media.haloarunika.com/a.mp3')).toMatch(/https/);
    expect(urlWarning('apel.png')).toMatch(/lengkap/);
    expect(urlWarning('https://pub-123.r2.dev/a.mp3')).toMatch(/r2\.dev/);
  });
});

describe('HurufListPage', () => {
  it('lists letters with status, version and the free letter', async () => {
    mock.onGet('/admin/huruf/letters').reply(200, { data: letters });
    renderAt('/huruf');

    expect(await screen.findByText('Apel')).toBeInTheDocument();
    expect(screen.getByText('Semua · 4')).toBeInTheDocument();
    expect(screen.getByText('Terbit · 2')).toBeInTheDocument();
    expect(screen.getByText('Draft · 1')).toBeInTheDocument();
    expect(screen.getByText('Disembunyikan · 1')).toBeInTheDocument();
    expect(screen.getByText('Ada perubahan')).toBeInTheDocument();
    expect(screen.getByText('Gratis')).toBeInTheDocument();
    expect(screen.getByText('v3')).toBeInTheDocument();
    expect(screen.getByText('1/2')).toBeInTheDocument();
  });

  it('filters by status tab and search', async () => {
    mock.onGet('/admin/huruf/letters').reply(200, { data: letters });
    const user = userEvent.setup();
    renderAt('/huruf');
    await screen.findByText('Apel');

    await user.click(screen.getByText('Draft · 1'));
    expect(screen.getByText('Domba')).toBeInTheDocument();
    expect(screen.queryByText('Apel')).not.toBeInTheDocument();

    await user.click(screen.getByText('Semua · 4'));
    await user.type(screen.getByPlaceholderText('Cari huruf atau kata'), 'bol');
    expect(screen.getByText('Bola')).toBeInTheDocument();
    expect(screen.queryByText('Harimau')).not.toBeInTheDocument();
  });

  it('reorders letters and saves the full order', async () => {
    mock.onGet('/admin/huruf/letters').reply(200, { data: letters });
    mock.onPut('/admin/huruf/order').reply(204);
    const user = userEvent.setup();
    renderAt('/huruf');
    await screen.findByText('Apel');

    await user.click(screen.getByRole('button', { name: /Ubah urutan/ }));
    await user.click(screen.getByRole('button', { name: 'Turunkan A' }));
    await user.click(screen.getByRole('button', { name: /Simpan urutan/ }));
    await waitFor(() => expect(mock.history.put).toHaveLength(1));
    expect(JSON.parse(mock.history.put[0].data)).toEqual({ ids: ['id-B', 'id-A', 'id-D', 'id-H'] });
  });

  it('disables reordering for editors', async () => {
    useAuthStore.setState({ role: 'editor' });
    mock.onGet('/admin/huruf/letters').reply(200, { data: letters });
    renderAt('/huruf');
    await screen.findByText('Apel');
    expect(screen.getByRole('button', { name: /Ubah urutan/ })).toBeDisabled();
  });
});

describe('HurufEditorPage', () => {
  it('shows the draft with its assets, strokes and preview', async () => {
    mock.onGet('/admin/huruf/letters/id-A/draft').reply(200, { data: draft() });
    mock.onPost('/admin/huruf/letters/id-A/preview').reply(200, {
      data: {
        id: 'id-A', version: 0, upper: 'A', lower: 'a',
        kenali: { word: 'Apel', highlight: [0], image_url: 'https://media.test/apel.webp' },
        dengar: { letter_audio_url: 'https://media.test/a.mp3', word_audio_url: '' },
        tebalkan: draft().draft.tebalkan, feedback: draft().draft.feedback,
      },
    });
    renderAt('/huruf/id-A');

    expect(await screen.findByRole('heading', { name: 'Huruf A' })).toBeInTheDocument();
    expect(screen.getByLabelText('Kata contoh')).toHaveValue('Apel');
    expect(screen.getByText(/apel.webp · 512 × 512 · 176 KB/)).toBeInTheDocument();
    expect(screen.getByText(/a.mp3 · 1,2 detik/)).toBeInTheDocument();
    expect(screen.getByLabelText('Path garis 1')).toHaveValue('M150 30 L70 260');
    expect(screen.getByText(/Versi terbit: v3/)).toBeInTheDocument();
    expect(screen.getByText('Pratinjau')).toBeInTheDocument();
    await waitFor(() => expect(mock.history.post.some((r) => r.url?.endsWith('/preview'))).toBe(true));
  });

  it('autosaves two seconds after the last edit', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mock.onGet('/admin/huruf/letters/id-A/draft').reply(200, { data: draft() });
    mock.onPost('/admin/huruf/letters/id-A/preview').reply(200, { data: null });
    mock.onPut('/admin/huruf/letters/id-A/draft').reply((cfg) => [
      200,
      { data: { ...draft({ draft_rev: 8 }), draft: JSON.parse(cfg.data).draft } },
    ]);
    renderAt('/huruf/id-A');
    const word = await screen.findByLabelText('Kata contoh');

    fireEvent.change(word, { target: { value: 'Anggur' } });
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_MS - 500));
    expect(mock.history.put).toHaveLength(0);
    fireEvent.change(word, { target: { value: 'Ayam' } });
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_MS + 100));

    await waitFor(() => expect(mock.history.put).toHaveLength(1));
    const body = JSON.parse(mock.history.put[0].data);
    expect(body.draft_rev).toBe(7);
    expect(body.draft.kenali.word).toBe('Ayam');
  });

  it('asks to reload when someone else saved first', async () => {
    mock.onGet('/admin/huruf/letters/id-A/draft').reply(200, { data: draft() });
    mock.onPost('/admin/huruf/letters/id-A/preview').reply(200, { data: null });
    mock.onPut('/admin/huruf/letters/id-A/draft').reply(409, { code: 'DRAFT_CONFLICT' });
    const user = userEvent.setup();
    renderAt('/huruf/id-A');
    await screen.findByLabelText('Kata contoh');

    await user.click(screen.getByRole('button', { name: /Simpan draft/ }));
    expect((await screen.findAllByText('Draft diubah oleh orang lain')).length).toBeGreaterThan(0);
  });

  it('highlights the fields a refused publish names', async () => {
    mock.onGet('/admin/huruf/letters/id-A/draft').reply(200, { data: draft() });
    mock.onPost('/admin/huruf/letters/id-A/preview').reply(200, { data: null });
    mock.onPost('/admin/huruf/letters/id-A/publish').reply(422, {
      code: 'VALIDATION_FAILED',
      fields: [
        { path: 'dengar.word_audio_id', code: 'REQUIRED' },
        { path: 'tebalkan.upper[0].path', code: 'INVALID_PATH' },
      ],
    });
    const user = userEvent.setup();
    renderAt('/huruf/id-A');
    await screen.findByLabelText('Kata contoh');

    await user.click(screen.getByRole('button', { name: /Terbitkan/ }));
    await screen.findAllByText('Terbitkan huruf A?');
    // The confirm's OK button comes after the header's in the document.
    await user.click(screen.getAllByRole('button', { name: 'Terbitkan' }).at(-1)!);

    expect(await screen.findByText('Wajib diisi sebelum terbit')).toBeInTheDocument();
    expect(screen.getByText('Path garis tidak valid')).toBeInTheDocument();
    expect(screen.getByText(/Draft belum bisa diterbitkan/)).toBeInTheDocument();
  });

  it('shows why an upload was refused', async () => {
    mock.onGet('/admin/huruf/letters/id-A/draft').reply(200, { data: draft() });
    mock.onPost('/admin/huruf/letters/id-A/preview').reply(200, { data: null });
    mock.onPost('/admin/assets').reply(422, { code: 'INVALID_ASSET', reason: 'TOO_LARGE' });
    const user = userEvent.setup();
    renderAt('/huruf/id-A');
    await screen.findByLabelText('Kata contoh');

    const input = screen.getByLabelText('Unggah Apel') as HTMLInputElement;
    await user.upload(input, new File(['x'.repeat(10)], 'big.png', { type: 'image/png' }));
    expect(await screen.findByText('Ukuran gambar maksimal 500 KB')).toBeInTheDocument();
    expect(mock.history.put).toHaveLength(0);
  });

  it('flags an invalid stroke path as it is typed', async () => {
    mock.onGet('/admin/huruf/letters/id-A/draft').reply(200, { data: draft() });
    mock.onPost('/admin/huruf/letters/id-A/preview').reply(200, { data: null });
    renderAt('/huruf/id-A');
    const path = await screen.findByLabelText('Path garis 1');
    fireEvent.change(path, { target: { value: 'M10 10 A5 5' } });
    expect(screen.getByText(/unsupported character "A"/)).toBeInTheDocument();
  });

  it('turns the free letter off and on', async () => {
    mock.onGet('/admin/huruf/letters/id-A/draft').reply(200, { data: draft() });
    mock.onPost('/admin/huruf/letters/id-A/preview').reply(200, { data: null });
    mock.onPost('/admin/huruf/letters/id-A/unset-free').reply(204);
    mock.onPost('/admin/huruf/letters/id-A/set-free').reply(204);
    const user = userEvent.setup();
    renderAt('/huruf/id-A');
    const free = await screen.findByRole('switch', { name: 'Gratis untuk semua' });
    expect(free).toBeChecked();
    expect(free).toBeEnabled();

    await user.click(free);
    await waitFor(() => expect(mock.history.post.some((r) => r.url?.endsWith('/unset-free'))).toBe(true));
    expect(mock.history.post.some((r) => r.url?.endsWith('/set-free') && !r.url.endsWith('/unset-free'))).toBe(false);
  });

  it('takes a media URL instead of an upload', async () => {
    mock.onGet('/admin/huruf/letters/id-A/draft').reply(200, { data: draft() });
    mock.onPost('/admin/huruf/letters/id-A/preview').reply(200, { data: null });
    mock.onPut('/admin/huruf/letters/id-A/draft').reply(200, { data: draft({ draft_rev: 8 }) });
    renderAt('/huruf/id-A');
    await screen.findByLabelText('Kata contoh');

    const sources = screen.getAllByText('Pakai URL');
    fireEvent.click(sources[1]); // the letter sound
    fireEvent.change(screen.getByLabelText('URL Bunyi huruf "A"'), {
      target: { value: 'https://pub-1.r2.dev/a.mp3' },
    });
    expect(screen.getByText(/r2\.dev diblokir/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('URL Bunyi huruf "A"'), {
      target: { value: 'https://media.haloarunika.com/huruf/a.mp3' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Simpan draft/ }));
    await waitFor(() => expect(mock.history.put).toHaveLength(1));
    const body = JSON.parse(mock.history.put[0].data as string);
    expect(body.draft.dengar).toEqual({
      letter_audio_id: null,
      word_audio_id: null,
      letter_audio_url: 'https://media.haloarunika.com/huruf/a.mp3',
    });
    expect(body.draft.kenali.image_asset_id).toBe('img');
  });

  it('opens a URL-only slot in URL mode', async () => {
    const d = draft();
    d.draft.kenali = { word: 'Apel', highlight: [0], image_asset_id: null, image_url: 'https://media.test/apel.png' };
    mock.onGet('/admin/huruf/letters/id-A/draft').reply(200, { data: d });
    mock.onPost('/admin/huruf/letters/id-A/preview').reply(200, { data: null });
    renderAt('/huruf/id-A');
    expect(await screen.findByLabelText('URL Apel')).toHaveValue('https://media.test/apel.png');
  });

  it('disables publisher-only controls for editors', async () => {
    useAuthStore.setState({ role: 'editor' });
    mock.onGet('/admin/huruf/letters/id-A/draft').reply(200, { data: draft() });
    mock.onPost('/admin/huruf/letters/id-A/preview').reply(200, { data: null });
    renderAt('/huruf/id-A');
    await screen.findByLabelText('Kata contoh');
    // The header's button, not a previous test's confirm still animating out.
    const header = screen
      .getAllByRole('button', { name: /Terbitkan/ })
      .find((b) => b.closest('.ant-modal') === null);
    expect(header).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Tampil di aplikasi' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Gratis untuk semua' })).toBeDisabled();
    // Editing and saving drafts stays open.
    expect(screen.getByRole('button', { name: /Simpan draft/ })).toBeEnabled();
  });
});

describe('RolesPage', () => {
  const admins = [
    { id: '1', email: 'pub@arunika.id', role: 'publisher' },
    { id: '2', email: 'tim.konten@arunika.id', role: 'editor' },
  ];

  it('explains the last-publisher refusal', async () => {
    mock.onGet('/admin/admins').reply(200, { data: admins });
    mock.onPatch('/admin/admins/1/role').reply(409, { code: 'LAST_PUBLISHER' });
    const user = userEvent.setup();
    renderAt('/settings/roles');
    await screen.findByText('pub@arunika.id');

    await user.click(screen.getByLabelText('Peran pub@arunika.id'));
    await waitFor(() =>
      expect(document.querySelector('.ant-select-dropdown [title="Editor"]')).not.toBeNull(),
    );
    await user.click(document.querySelector('.ant-select-dropdown [title="Editor"]') as HTMLElement);
    expect(await screen.findByText('Minimal harus ada satu Publisher')).toBeInTheDocument();
  });

  it('is read-only for editors', async () => {
    useAuthStore.setState({ role: 'editor' });
    mock.onGet('/admin/admins').reply(200, { data: admins });
    renderAt('/settings/roles');
    await screen.findByText('pub@arunika.id');
    expect(screen.getByText('Hanya Publisher yang bisa mengubah peran.')).toBeInTheDocument();
  });
});
