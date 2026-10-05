import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MockAdapter from 'axios-mock-adapter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Modal } from 'antd';
import api from '../../api/client';
import type { AngkaLevelDraft, AngkaLevelRow, AngkaNumberRow, AngkaObjectDraft, AngkaObjectRow } from '../../api/angka';
import { useAuthStore } from '../../store/authStore';
import AngkaPage from '../../pages/angka/AngkaPage';
import AngkaLevelEditorPage from '../../pages/angka/AngkaLevelEditorPage';
import { AUTOSAVE_MS, statusGroup } from '../../components/content/contentUtils';
import { angkaFieldErrorText, conflictText } from '../../pages/angka/angkaUtils';

const mock = new MockAdapter(api);

beforeEach(() => {
  mock.reset();
  useAuthStore.setState({ role: 'publisher' });
});
afterEach(() => {
  mock.reset();
  vi.useRealTimers();
  Modal.destroyAll();
});

function Where() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname + loc.search}</div>;
}

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/angka" element={<AngkaPage />} />
          <Route path="/angka/levels/:id" element={<AngkaLevelEditorPage />} />
        </Routes>
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const status = { updated_by: 'tim@arunika.id', updated_at: '2026-09-30T04:05:00Z' };

const level = (n: number, over: Partial<AngkaLevelRow> = {}): AngkaLevelRow => ({
  id: `l${n}`,
  name: ['Hitung 1 sampai 5', 'Hitung 1 sampai 10', 'Hitung 11 sampai 20'][n - 1],
  sort_order: n,
  is_free: n === 1,
  status: 'published',
  has_unpublished_changes: false,
  version: 1,
  range: [
    { min: 1, max: 5 },
    { min: 1, max: 10 },
    { min: 11, max: 20 },
  ][n - 1],
  question_count: 10,
  object_names: ['Apel', 'Bola'],
  stars: { three: 9, two: 7 },
  prerequisite_id: n > 1 ? `l${n - 1}` : null,
  prerequisite_sort_order: n > 1 ? n - 1 : null,
  prerequisite_name: '',
  ...status,
  ...over,
});

const levels = [
  level(1, { version: 2 }),
  level(2),
  level(3, { status: 'draft', version: null, has_unpublished_changes: true }),
];

const object = (id: string, over: Partial<AngkaObjectRow> = {}): AngkaObjectRow => ({
  id,
  name: id,
  question_text: `Ada berapa ${id}?`,
  image_url: '',
  question_audio_url: '',
  used_in: 2,
  status: 'published',
  has_unpublished_changes: false,
  ...status,
  ...over,
});

const objects = [
  object('Apel'),
  object('Bola'),
  object('Ikan'),
  object('Bebek', { used_in: 1 }),
  object('Mobil', { status: 'draft', used_in: 0 }),
];

const number = (value: number, over: Partial<AngkaNumberRow> = {}): AngkaNumberRow => ({
  value,
  name: ['satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh'][value - 1] ?? `n${value}`,
  audio_url: value <= 3 ? `https://media.test/${value}.mp3` : '',
  object_id: value <= 3 ? 'Apel' : null,
  object_name: value <= 3 ? 'Apel' : '',
  object_image_url: '',
  is_free: value <= 5,
  status: value <= 3 ? 'published' : 'draft',
  has_unpublished_changes: value > 3,
  draft: { name: 'x', audio_asset_id: null, object_id: null },
  draft_rev: 1,
  assets: {},
  ...status,
  ...over,
});

const numbers = Array.from({ length: 7 }, (_, i) => number(i + 1));

function mockLists() {
  mock.onGet('/admin/angka/levels').reply(200, { data: levels });
  mock.onGet('/admin/angka/objects').reply(200, { data: objects });
  mock.onGet('/admin/angka/numbers').reply(200, { data: numbers });
}

const levelDraft = (over: Partial<AngkaLevelDraft> = {}): AngkaLevelDraft => ({
  ...level(2, { has_unpublished_changes: true }),
  draft_rev: 5,
  draft: {
    name: 'Hitung 1 sampai 10',
    prerequisite_id: 'l1',
    range: { min: 1, max: 10 },
    question_count: 10,
    object_ids: ['Apel', 'Bola'],
    layout: 'scatter',
    stars: { three: 9, two: 7 },
    feedback: {
      success: 'Hebat! Benar!',
      retry: 'Hampir benar!',
      hint: 'Sentuh {benda} satu per satu sambil menyebut 1, 2, 3…',
    },
  },
  ...over,
});

const preview = {
  seed: 7,
  count_audio: {},
  questions: [
    {
      count: 3,
      size: 52,
      layout: 'rows',
      points: [
        { x: 96, y: 90 },
        { x: 160, y: 90 },
        { x: 224, y: 90 },
      ],
      object: {
        id: 'Apel',
        name: 'apel',
        question_text: 'Ada berapa apel?',
        image_url: '',
        question_audio_url: '',
        hidden: false,
      },
    },
    {
      count: 5,
      size: 52,
      layout: 'rows',
      points: [],
      object: {
        id: 'Bola',
        name: 'bola',
        question_text: 'Ada berapa bola?',
        image_url: '',
        question_audio_url: '',
        hidden: false,
      },
    },
  ],
};

function mockEditor(over: Partial<AngkaLevelDraft> = {}) {
  mockLists();
  mock.onGet('/admin/angka/levels/l2/draft').reply(200, { data: levelDraft(over) });
  mock.onPost('/admin/angka/levels/l2/preview').reply(200, { data: preview });
}

describe('helpers', () => {
  it('groups statuses for objects, numbers and levels', () => {
    expect(statusGroup(level(3, { status: 'draft', version: null }))).toBe('draft');
    expect(statusGroup(object('Apel', { status: 'draft' }))).toBe('draft');
    expect(statusGroup(object('Apel', { status: 'hidden' }))).toBe('hidden');
    expect(statusGroup(number(1))).toBe('published');
  });

  it('words publish errors and refusals in Indonesian', () => {
    expect(angkaFieldErrorText({ path: 'image_asset_id', code: 'NOT_TRANSPARENT' })).toBe(
      'Gambar harus berlatar transparan',
    );
    expect(angkaFieldErrorText({ path: 'question_audio_id', code: 'TOO_LONG' })).toBe('Suara maksimal 5 detik');
    expect(angkaFieldErrorText({ path: 'range.max', code: 'OUT_OF_RANGE' })).toBe('Antara 1 dan 20');
    expect(angkaFieldErrorText({ path: 'range.max', code: 'NUMBER_AUDIO_MISSING' })).toMatch(/Suara angka 1/);
    expect(angkaFieldErrorText({ path: 'numbers.12', code: 'NUMBER_AUDIO_MISSING' })).toBe(
      'Angka 12 belum punya suara yang terbit',
    );
    expect(conflictText('OBJECT_IN_USE')).toMatch(/Sembunyikan saja/);
    expect(conflictText('X')).toBeNull();
  });
});

describe('AngkaPage', () => {
  it('lists levels with range, stars, status and the free level', async () => {
    mockLists();
    renderAt('/angka');
    expect(await screen.findByText('Hitung 1 sampai 10')).toBeInTheDocument();
    expect(screen.getByText('Level Hitung Benda · 3')).toBeInTheDocument();
    expect(screen.getByText('Pustaka benda · 5')).toBeInTheDocument();
    expect(screen.getByText('Kenal Angka · 3')).toBeInTheDocument();
    expect(screen.getByText('Tanpa syarat')).toBeInTheDocument();
    expect(screen.getByText('Setelah Level 2')).toBeInTheDocument();
    expect(screen.getByText('11–20')).toBeInTheDocument();
    expect(screen.getAllByText('Gratis').length).toBeGreaterThan(0);
    expect(screen.getAllByText('★★★ ≥ 9')).toHaveLength(3);
    expect(screen.getByText('v2')).toBeInTheDocument();
    expect(screen.getAllByText('Draft').length).toBeGreaterThan(0);
    expect(screen.getByText(/Soal dibuat otomatis/)).toBeInTheDocument();
    // The object library summary.
    expect(screen.getAllByText('Dipakai di 2 level').length).toBeGreaterThan(0);
  });

  it('keeps the tab in the URL', async () => {
    mockLists();
    const user = userEvent.setup();
    renderAt('/angka');
    await screen.findByText('Hitung 1 sampai 10');
    await user.click(screen.getByRole('button', { name: 'Kelola pustaka' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/angka?tab=objects');
    expect(await screen.findByRole('button', { name: 'Edit Bebek' })).toBeInTheDocument();
  });

  it('adds a level and opens its editor', async () => {
    mockLists();
    mock.onPost('/admin/angka/levels').reply(201, { data: levelDraft({ id: 'l4' }) });
    const user = userEvent.setup();
    renderAt('/angka');
    await screen.findByText('Hitung 1 sampai 10');
    await user.click(screen.getByRole('button', { name: /Tambah level/ }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/angka/levels/l4'));
  });

  it('explains why a level in use cannot be deleted', async () => {
    mockLists();
    mock.onDelete('/admin/angka/levels/l3').reply(409, { code: 'LEVEL_IN_USE' });
    const user = userEvent.setup();
    renderAt('/angka');
    await screen.findByText('Hitung 11 sampai 20');
    await user.click(screen.getByRole('button', { name: 'Aksi lain Hitung 11 sampai 20' }));
    await user.click(await screen.findByText('Hapus'));
    await screen.findAllByText('Hapus Hitung 11 sampai 20?');
    await user.click(screen.getAllByRole('button', { name: 'Hapus' }).at(-1)!);
    expect(await screen.findByText(/menjadi syarat level lain/)).toBeInTheDocument();
  });

  it('turns a level free from its menu', async () => {
    mockLists();
    mock.onPost('/admin/angka/levels/l2/set-free').reply(204);
    const user = userEvent.setup();
    renderAt('/angka');
    await screen.findByText('Hitung 1 sampai 10');
    await user.click(screen.getByRole('button', { name: 'Aksi lain Hitung 1 sampai 10' }));
    await user.click(await screen.findByText('Jadikan gratis'));
    await waitFor(() => expect(mock.history.post.map((r) => r.url)).toContain('/admin/angka/levels/l2/set-free'));
  });

  it('disables publisher-only level actions for editors', async () => {
    useAuthStore.setState({ role: 'editor' });
    mockLists();
    renderAt('/angka');
    await screen.findByText('Hitung 1 sampai 10');
    for (const b of screen.getAllByRole('button', { name: /Aksi lain/ })) expect(b).toBeDisabled();
    expect(screen.getByRole('button', { name: /Tambah level/ })).toBeEnabled();
  });

  it('shows numbers with audio, object, free and visibility switches', async () => {
    mockLists();
    mock.onPost('/admin/angka/numbers/2/hide').reply(204);
    const user = userEvent.setup();
    renderAt('/angka?tab=numbers');
    expect(await screen.findByText('tujuh')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Putar angka 1' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Putar angka 4' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Tambah suara/ })).toHaveLength(4);
    expect(screen.getByRole('switch', { name: 'Gratis angka 5' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Gratis angka 6' })).not.toBeChecked();

    // Showing a number without audio opens its drawer instead of failing.
    await user.click(screen.getByRole('switch', { name: 'Tampilkan angka 4' }));
    expect(await screen.findByText('Isi suara angka 4 dulu, lalu klik Terbitkan')).toBeInTheDocument();
    expect(await screen.findByText('Angka 4', { selector: '.ant-drawer-title' })).toBeInTheDocument();
    expect(mock.history.post.map((r) => r.url)).not.toContain('/admin/angka/numbers/4/publish');
    await user.click(screen.getByRole('switch', { name: 'Tampilkan angka 2' }));
    await waitFor(() => expect(mock.history.post.map((r) => r.url)).toContain('/admin/angka/numbers/2/hide'));
  });

  it('edits a number in its drawer and publishes it', async () => {
    mockLists();
    mock
      .onPut('/admin/angka/numbers/4/draft')
      .reply((cfg) => [200, { data: { ...number(4), draft_rev: 2, draft: JSON.parse(cfg.data).draft } }]);
    mock.onPost('/admin/angka/numbers/4/publish').reply(204);
    const user = userEvent.setup();
    renderAt('/angka?tab=numbers');
    await screen.findByText('tujuh');
    const row = screen.getByText('empat').closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Edit' }));
    const name = await screen.findByLabelText('Nama angka');
    fireEvent.change(name, { target: { value: 'empat!' } });
    await user.click(screen.getAllByText('Pakai URL')[0]);
    fireEvent.change(screen.getByLabelText(/^URL Suara/), {
      target: { value: 'https://media.haloarunika.com/angka/4.mp3' },
    });
    await user.click(screen.getByRole('button', { name: 'Terbitkan' }));
    await waitFor(() => expect(mock.history.post.map((r) => r.url)).toContain('/admin/angka/numbers/4/publish'));
    const body = JSON.parse(mock.history.put[0].data as string);
    expect(body.draft).toMatchObject({
      name: 'empat!',
      audio_asset_id: null,
      audio_url: 'https://media.haloarunika.com/angka/4.mp3',
    });
  });
});

describe('Object library', () => {
  const objectDraft = (over: Partial<AngkaObjectDraft> = {}): AngkaObjectDraft => ({
    ...object('Bebek', { used_in: 1 }),
    draft_rev: 3,
    draft: { name: 'bebek', question_text: 'Ada berapa bebek?', image_asset_id: null, question_audio_id: null },
    assets: {},
    ...over,
  });

  it('prefills the question from a new name', async () => {
    mockLists();
    mock.onPost('/admin/angka/objects').reply(201, {
      data: objectDraft({
        id: 'new',
        name: '',
        draft: { name: '', question_text: '', image_asset_id: null, question_audio_id: null },
      }),
    });
    mock.onGet('/admin/angka/objects/new/draft').reply(200, {
      data: objectDraft({
        id: 'new',
        name: '',
        status: 'draft',
        draft: { name: '', question_text: '', image_asset_id: null, question_audio_id: null },
      }),
    });
    mock
      .onPut('/admin/angka/objects/new/draft')
      .reply((cfg) => [200, { data: objectDraft({ id: 'new', draft: JSON.parse(cfg.data).draft }) }]);
    const user = userEvent.setup();
    renderAt('/angka?tab=objects');
    await user.click(await screen.findByRole('button', { name: /Tambah benda/ }));
    const name = await screen.findByLabelText('Nama benda');
    fireEvent.change(name, { target: { value: 'kucing' } });
    expect(screen.getByLabelText('Teks pertanyaan')).toHaveValue('Ada berapa kucing?');
    expect(screen.getByText('PNG/WebP latar transparan, maks. 300 KB')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Simpan draft' }));
    await waitFor(() => expect(mock.history.put).toHaveLength(1));
    expect(JSON.parse(mock.history.put[0].data as string).draft.question_text).toBe('Ada berapa kucing?');
  });

  it('suggests hiding an object a level uses instead of deleting it', async () => {
    mockLists();
    mock.onGet('/admin/angka/objects/Bebek/draft').reply(200, { data: objectDraft({ id: 'Bebek' }) });
    mock.onDelete('/admin/angka/objects/Bebek').reply(409, { code: 'OBJECT_IN_USE' });
    const user = userEvent.setup();
    renderAt('/angka?tab=objects');
    await user.click(await screen.findByRole('button', { name: 'Edit Bebek' }));
    await screen.findByLabelText('Nama benda');
    await user.click(screen.getByRole('button', { name: 'Hapus' }));
    await screen.findAllByText('Hapus bebek?');
    await user.click(screen.getAllByRole('button', { name: 'Hapus' }).at(-1)!);
    expect(await screen.findByText(/Sembunyikan saja/)).toBeInTheDocument();
  });

  it('marks fields a refused publish names', async () => {
    mockLists();
    mock.onGet('/admin/angka/objects/Bebek/draft').reply(200, { data: objectDraft({ id: 'Bebek' }) });
    mock.onPost('/admin/angka/objects/Bebek/publish').reply(422, {
      code: 'VALIDATION_FAILED',
      fields: [{ path: 'image_asset_id', code: 'NOT_TRANSPARENT' }],
    });
    const user = userEvent.setup();
    renderAt('/angka?tab=objects');
    await user.click(await screen.findByRole('button', { name: 'Edit Bebek' }));
    await screen.findByLabelText('Nama benda');
    await user.click(screen.getByRole('button', { name: 'Terbitkan' }));
    expect(await screen.findByText('Gambar harus berlatar transparan')).toBeInTheDocument();
  });
});

describe('AngkaLevelEditorPage', () => {
  it('shows the draft, its sections and the question preview', async () => {
    mockEditor();
    renderAt('/angka/levels/l2');
    expect(await screen.findByLabelText('Nama level')).toHaveValue('Hitung 1 sampai 10');
    expect(screen.getByText('Ada perubahan belum terbit')).toBeInTheDocument();
    expect(screen.getByText(/Versi terbit: v1/)).toBeInTheDocument();
    expect(await screen.findByText(/Saat ini: Level 1. Hanya satu level yang bisa gratis./)).toBeInTheDocument();
    expect(screen.getByText(/Satu benda per soal, dipilih acak. 2 benda dipilih./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Apel/, pressed: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ikan/, pressed: false })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tersebar', pressed: true })).toBeInTheDocument();
    expect(screen.getAllByText('dari 10 soal')).toHaveLength(2);
    expect(screen.getByText('{benda} diganti otomatis dengan nama benda di soal.')).toBeInTheDocument();

    expect(await screen.findByText('Contoh soal 1 dari 2 · draft')).toBeInTheDocument();
    expect(screen.getByText('Ada berapa apel?')).toBeInTheDocument();
    expect(screen.getByText(/pratinjau ini sesuai dengan yang dilihat anak/)).toBeInTheDocument();
  });

  it('checks an answer in the preview with the draft feedback', async () => {
    mockEditor();
    const user = userEvent.setup();
    renderAt('/angka/levels/l2');
    await screen.findByText('Ada berapa apel?');
    const periksa = screen.getByRole('button', { name: 'Periksa' });
    expect(periksa).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '2' }));
    await user.click(periksa);
    expect(screen.getByRole('status')).toHaveTextContent('Hampir benar!');
    expect(screen.getByRole('status')).toHaveTextContent('Sentuh apel satu per satu');
    await user.click(screen.getByRole('button', { name: 'Hapus' }));
    await user.click(screen.getByRole('button', { name: '3' }));
    await user.click(periksa);
    expect(screen.getByRole('status')).toHaveTextContent('Hebat! Benar!');

    await user.click(screen.getByRole('button', { name: 'Soal berikutnya' }));
    expect(screen.getByText('Ada berapa bola?')).toBeInTheDocument();
  });

  it('asks for new questions with Acak ulang', async () => {
    mockEditor();
    const user = userEvent.setup();
    renderAt('/angka/levels/l2');
    await screen.findByText('Ada berapa apel?');
    const first = JSON.parse(mock.history.post[0].data as string).seed;
    await user.click(screen.getByRole('button', { name: /Acak ulang/ }));
    await waitFor(() => expect(mock.history.post.length).toBeGreaterThan(1));
    expect(JSON.parse(mock.history.post.at(-1)!.data as string).seed).not.toBe(first);
  });

  it('autosaves two seconds after the last edit', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockEditor();
    mock
      .onPut('/admin/angka/levels/l2/draft')
      .reply((cfg) => [200, { data: { ...levelDraft({ draft_rev: 6 }), draft: JSON.parse(cfg.data).draft } }]);
    renderAt('/angka/levels/l2');
    const name = await screen.findByLabelText('Nama level');
    fireEvent.change(name, { target: { value: 'Hitung sampai 10' } });
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_MS - 500));
    expect(mock.history.put).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: /Ikan/ }));
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_MS + 100));
    await waitFor(() => expect(mock.history.put).toHaveLength(1));
    const body = JSON.parse(mock.history.put[0].data as string);
    expect(body.draft_rev).toBe(5);
    expect(body.draft.name).toBe('Hitung sampai 10');
    expect(body.draft.object_ids).toEqual(['Apel', 'Bola', 'Ikan']);
  });

  it('asks to reload when someone else saved first', async () => {
    mockEditor();
    mock.onPut('/admin/angka/levels/l2/draft').reply(409, { code: 'DRAFT_CONFLICT' });
    const user = userEvent.setup();
    renderAt('/angka/levels/l2');
    const name = await screen.findByLabelText('Nama level');
    fireEvent.change(name, { target: { value: 'x' } });
    await user.click(screen.getByRole('button', { name: /Simpan draft/ }));
    expect((await screen.findAllByText('Draft diubah oleh orang lain')).length).toBeGreaterThan(0);
  });

  it('highlights the fields a refused publish names', async () => {
    mockEditor();
    mock.onPost('/admin/angka/levels/l2/publish').reply(422, {
      code: 'VALIDATION_FAILED',
      fields: [
        { path: 'stars.two', code: 'GREATER_THAN_THREE' },
        { path: 'stars.three', code: 'LESS_THAN_TWO' },
      ],
    });
    const user = userEvent.setup();
    renderAt('/angka/levels/l2');
    await screen.findByLabelText('Nama level');
    await user.click(screen.getByRole('button', { name: /Terbitkan/ }));
    await screen.findAllByText('Terbitkan Hitung 1 sampai 10?');
    await user.click(screen.getAllByRole('button', { name: 'Terbitkan' }).at(-1)!);
    expect(await screen.findByText('★★ tidak boleh lebih dari ★★★')).toBeInTheDocument();
    expect(screen.getByText('★★★ tidak boleh kurang dari ★★')).toBeInTheDocument();
  });

  it('names the numbers without audio and links to Kenal Angka', async () => {
    mockEditor();
    mock.onPost('/admin/angka/levels/l2/publish').reply(422, {
      code: 'VALIDATION_FAILED',
      fields: [
        { path: 'numbers.8', code: 'NUMBER_AUDIO_MISSING' },
        { path: 'numbers.10', code: 'NUMBER_AUDIO_MISSING' },
        { path: 'range.max', code: 'NUMBER_AUDIO_MISSING' },
      ],
    });
    const user = userEvent.setup();
    renderAt('/angka/levels/l2');
    await screen.findByLabelText('Nama level');
    const header = screen.getAllByRole('button', { name: /Terbitkan/ }).find((b) => b.closest('.ant-modal') === null);
    await user.click(header!);
    await screen.findAllByText('Terbitkan Hitung 1 sampai 10?');
    await user.click(screen.getAllByRole('button', { name: 'Terbitkan' }).at(-1)!);
    expect(await screen.findByText('Angka 8, 10 belum punya suara yang terbit')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'tab Kenal Angka' }));
    expect(await screen.findByTestId('location')).toHaveTextContent('/angka?tab=numbers');
  });

  it('publishes a never-published level from Tampil di aplikasi', async () => {
    mockEditor({ status: 'draft', version: null });
    mock.onPost('/admin/angka/levels/l2/publish').reply(200, { data: { version: 1 } });
    const user = userEvent.setup();
    renderAt('/angka/levels/l2');
    const shown = await screen.findByRole('switch', { name: 'Tampil di aplikasi' });
    expect(shown).toBeEnabled();
    expect(shown).not.toBeChecked();
    await user.click(shown);
    await waitFor(() => expect(mock.history.post.map((r) => r.url)).toContain('/admin/angka/levels/l2/publish'));
  });

  it('turns the free level on', async () => {
    mockEditor();
    mock.onPost('/admin/angka/levels/l2/set-free').reply(204);
    const user = userEvent.setup();
    renderAt('/angka/levels/l2');
    const free = await screen.findByRole('switch', { name: 'Gratis untuk semua' });
    expect(free).not.toBeChecked();
    await user.click(free);
    await waitFor(() => expect(mock.history.post.map((r) => r.url)).toContain('/admin/angka/levels/l2/set-free'));
  });

  it('disables publisher-only controls for editors', async () => {
    useAuthStore.setState({ role: 'editor' });
    mockEditor();
    renderAt('/angka/levels/l2');
    await screen.findByLabelText('Nama level');
    const header = screen.getAllByRole('button', { name: /Terbitkan/ }).find((b) => b.closest('.ant-modal') === null);
    expect(header).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Tampil di aplikasi' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Gratis untuk semua' })).toBeDisabled();
    expect(screen.getByLabelText('Nama level')).toBeEnabled();
  });
});
