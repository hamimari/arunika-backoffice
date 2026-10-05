import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import MockAdapter from 'axios-mock-adapter';
import api from '../../api/client';
import { errorCode, hurufApi, validationFields, type HurufContent } from '../../api/huruf';
import { assetsApi, uploadErrorText } from '../../api/assets';
import { adminsApi } from '../../api/admins';

const mock = new MockAdapter(api);
beforeEach(() => mock.reset());
afterEach(() => mock.reset());

const draft: HurufContent = {
  upper: 'A',
  lower: 'a',
  kenali: { word: 'Apel', highlight: [0], image_asset_id: null },
  dengar: { letter_audio_id: null, word_audio_id: null },
  tebalkan: { grid: 300, lower_required: false, upper: [], lower: [] },
  feedback: { success: 'Keren!', retry: 'Belum pas', hint: 'Mulai dari 1' },
};

describe('hurufApi', () => {
  it('hits every Huruf admin route', async () => {
    mock.onGet('/admin/huruf/letters').reply(200, { data: [{ id: 'a' }] });
    mock.onGet('/admin/huruf/letters/a/draft').reply(200, { data: { id: 'a', draft_rev: 3 } });
    mock.onPut('/admin/huruf/letters/a/draft').reply((cfg) => [200, { data: JSON.parse(cfg.data) }]);
    mock.onPost('/admin/huruf/letters/a/preview').reply(200, { data: { id: 'a' } });
    mock.onGet('/admin/huruf/letters/a/versions').reply(200, { data: [] });
    mock.onPost('/admin/huruf/letters/a/publish').reply(200, { data: { version: 2 } });
    mock.onPost('/admin/huruf/letters/a/rollback/1').reply(200, { data: { version: 3 } });
    mock.onPost(/\/admin\/huruf\/letters\/a\/(hide|unhide|set-free)/).reply(204);
    mock.onPut('/admin/huruf/order').reply(204);

    expect(await hurufApi.list()).toEqual([{ id: 'a' }]);
    expect((await hurufApi.getDraft('a')).draft_rev).toBe(3);
    expect(await hurufApi.saveDraft('a', draft, 3)).toEqual({ draft, draft_rev: 3 });
    expect(await hurufApi.preview('a', draft)).toEqual({ id: 'a' });
    expect(await hurufApi.versions('a')).toEqual([]);
    expect(await hurufApi.publish('a')).toEqual({ version: 2 });
    expect(await hurufApi.rollback('a', 1)).toEqual({ version: 3 });
    await hurufApi.hide('a');
    await hurufApi.unhide('a');
    await hurufApi.setFree('a');
    await hurufApi.reorder(['a', 'b']);
    expect(JSON.parse(mock.history.put[1].data)).toEqual({ ids: ['a', 'b'] });
  });

  it('reads validation fields and error codes', () => {
    const err = {
      response: {
        data: { code: 'VALIDATION_FAILED', fields: [{ path: 'kenali.word', code: 'REQUIRED' }] },
      },
    };
    expect(validationFields(err)).toEqual([{ path: 'kenali.word', code: 'REQUIRED' }]);
    expect(validationFields({ response: { data: { code: 'DRAFT_CONFLICT' } } })).toEqual([]);
    expect(validationFields(new Error('x'))).toEqual([]);
    expect(errorCode({ response: { data: { code: 'DRAFT_CONFLICT' } } })).toBe('DRAFT_CONFLICT');
    expect(errorCode(null)).toBeUndefined();
  });
});

describe('assetsApi', () => {
  it('uploads multipart with the kind', async () => {
    mock.onPost('/admin/assets').reply(201, { data: { id: 'x', url: 'https://m/x.webp' } });
    const file = new File(['abc'], 'apel.webp', { type: 'image/webp' });
    const asset = await assetsApi.upload(file, 'image');
    expect(asset.id).toBe('x');
    const body = mock.history.post[0].data as FormData;
    expect(body.get('kind')).toBe('image');
    expect((body.get('file') as File).name).toBe('apel.webp');
  });

  it('explains refused uploads in Indonesian', () => {
    const refused = (reason: string) => ({ response: { data: { code: 'INVALID_ASSET', reason } } });
    expect(uploadErrorText(refused('TOO_LARGE'), 'image')).toBe('Ukuran gambar maksimal 500 KB');
    expect(uploadErrorText(refused('TOO_LARGE'), 'audio')).toBe('Ukuran suara maksimal 300 KB');
    expect(uploadErrorText(refused('TOO_LONG'), 'audio')).toBe('Suara maksimal 10 detik');
    expect(uploadErrorText(refused('NOT_SQUARE'), 'image')).toMatch(/persegi/);
    expect(uploadErrorText(refused('UNSUPPORTED_TYPE'), 'image')).toBe('Gambar harus PNG atau WebP');
    expect(uploadErrorText(new Error('network'), 'audio')).toMatch(/Gagal/);
  });
});

describe('adminsApi', () => {
  it('lists admins, changes a role and reads the audit log', async () => {
    mock.onGet('/admin/admins').reply(200, { data: [{ id: '1', email: 'a@x', role: 'editor' }] });
    mock.onPatch('/admin/admins/1/role').reply(200, { data: { id: '1', email: 'a@x', role: 'publisher' } });
    mock.onGet('/admin/audit-log').reply(200, { data: [], total: 0 });

    expect(await adminsApi.list()).toHaveLength(1);
    expect((await adminsApi.setRole('1', 'publisher')).role).toBe('publisher');
    expect(await adminsApi.auditLog('letter', 'L')).toEqual({ data: [], total: 0 });
    expect(mock.history.get[1].params).toEqual({ entity_type: 'letter', entity_id: 'L', page: 1 });
  });
});
