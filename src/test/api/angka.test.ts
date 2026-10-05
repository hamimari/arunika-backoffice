import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import MockAdapter from 'axios-mock-adapter';
import api from '../../api/client';
import { angkaApi, type AngkaLevelContent } from '../../api/angka';

const mock = new MockAdapter(api);
beforeEach(() => mock.reset());
afterEach(() => mock.reset());

const level: AngkaLevelContent = {
  name: 'Hitung 1 sampai 10',
  prerequisite_id: null,
  range: { min: 1, max: 10 },
  question_count: 10,
  object_ids: ['apel'],
  layout: 'scatter',
  stars: { three: 9, two: 7 },
  feedback: { success: 'Hebat! Benar!', retry: 'Hampir benar!', hint: 'Sentuh {benda}' },
};

describe('angkaApi', () => {
  it('hits every object route', async () => {
    mock.onGet('/admin/angka/objects').reply(200, { data: [{ id: 'o' }] });
    mock.onPost('/admin/angka/objects').reply((cfg) => [201, { data: { id: 'o', ...JSON.parse(cfg.data) } }]);
    mock.onGet('/admin/angka/objects/o/draft').reply(200, { data: { id: 'o', draft_rev: 2 } });
    mock.onPut('/admin/angka/objects/o/draft').reply((cfg) => [200, { data: JSON.parse(cfg.data) }]);
    mock.onPost(/\/admin\/angka\/objects\/o\/(publish|hide|unhide)/).reply(204);
    mock.onDelete('/admin/angka/objects/o').reply(204);

    expect(await angkaApi.objects.list()).toEqual([{ id: 'o' }]);
    expect(await angkaApi.objects.create('apel')).toEqual({ id: 'o', name: 'apel' });
    expect((await angkaApi.objects.getDraft('o')).draft_rev).toBe(2);
    const draft = { name: 'apel', question_text: 'Ada berapa apel?', image_asset_id: null, question_audio_id: null };
    expect(await angkaApi.objects.saveDraft('o', draft, 2)).toEqual({ draft, draft_rev: 2 });
    await angkaApi.objects.publish('o');
    await angkaApi.objects.hide('o');
    await angkaApi.objects.unhide('o');
    await angkaApi.objects.remove('o');
    expect(mock.history.post.map((r) => r.url)).toEqual([
      '/admin/angka/objects',
      '/admin/angka/objects/o/publish',
      '/admin/angka/objects/o/hide',
      '/admin/angka/objects/o/unhide',
    ]);
    expect(mock.history.delete[0].url).toBe('/admin/angka/objects/o');
  });

  it('hits every number route', async () => {
    mock.onGet('/admin/angka/numbers').reply(200, { data: [{ value: 1 }] });
    mock.onPut('/admin/angka/numbers/3/draft').reply((cfg) => [200, { data: JSON.parse(cfg.data) }]);
    mock.onPost(/\/admin\/angka\/numbers\/3\/.+/).reply(204);

    expect(await angkaApi.numbers.list()).toEqual([{ value: 1 }]);
    const draft = { name: 'tiga', audio_asset_id: 'a', object_id: 'o' };
    expect(await angkaApi.numbers.saveDraft(3, draft, 4)).toEqual({ draft, draft_rev: 4 });
    for (const call of [
      angkaApi.numbers.publish,
      angkaApi.numbers.hide,
      angkaApi.numbers.unhide,
      angkaApi.numbers.setFree,
      angkaApi.numbers.unsetFree,
    ]) {
      await call(3);
    }
    expect(mock.history.post.map((r) => r.url?.split('/').pop())).toEqual([
      'publish',
      'hide',
      'unhide',
      'set-free',
      'unset-free',
    ]);
  });

  it('hits every level route', async () => {
    mock.onGet('/admin/angka/levels').reply(200, { data: [] });
    mock.onPost('/admin/angka/levels').reply(201, { data: { id: 'l' } });
    mock.onGet('/admin/angka/levels/l/draft').reply(200, { data: { id: 'l', draft_rev: 1 } });
    mock.onPut('/admin/angka/levels/l/draft').reply((cfg) => [200, { data: JSON.parse(cfg.data) }]);
    mock.onPost('/admin/angka/levels/l/preview').reply((cfg) => [200, { data: { seed: JSON.parse(cfg.data).seed } }]);
    mock.onGet('/admin/angka/levels/l/versions').reply(200, { data: [] });
    mock.onPost('/admin/angka/levels/l/publish').reply(200, { data: { version: 1 } });
    mock.onPost('/admin/angka/levels/l/rollback/1').reply(200, { data: { version: 2 } });
    mock.onPost(/\/admin\/angka\/levels\/l\/(hide|unhide|set-free|unset-free)/).reply(204);
    mock.onPut('/admin/angka/levels/order').reply(204);
    mock.onDelete('/admin/angka/levels/l').reply(204);

    expect(await angkaApi.levels.list()).toEqual([]);
    expect(await angkaApi.levels.create()).toEqual({ id: 'l' });
    expect((await angkaApi.levels.getDraft('l')).draft_rev).toBe(1);
    expect(await angkaApi.levels.saveDraft('l', level, 1)).toEqual({ draft: level, draft_rev: 1 });
    expect(await angkaApi.levels.preview('l', level, 42)).toEqual({ seed: 42 });
    expect(await angkaApi.levels.versions('l')).toEqual([]);
    expect(await angkaApi.levels.publish('l')).toEqual({ version: 1 });
    expect(await angkaApi.levels.rollback('l', 1)).toEqual({ version: 2 });
    await angkaApi.levels.hide('l');
    await angkaApi.levels.unhide('l');
    await angkaApi.levels.setFree('l');
    await angkaApi.levels.unsetFree('l');
    await angkaApi.levels.reorder(['l']);
    await angkaApi.levels.remove('l');
    expect(JSON.parse(mock.history.put.at(-1)!.data)).toEqual({ ids: ['l'] });
    expect(mock.history.delete[0].url).toBe('/admin/angka/levels/l');
  });
});
