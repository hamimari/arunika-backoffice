import api from './client';
import type { Asset } from './assets';
import type { ContentVersion } from '../components/content/contentUtils';

export type AngkaStatus = 'draft' | 'published' | 'hidden';

/** Status fields every Angka row carries (from its draft). */
interface AdminStatus {
  status: AngkaStatus;
  has_unpublished_changes: boolean;
  updated_by: string;
  updated_at: string;
}

/** A library object's editable content. Each media slot holds an uploaded
 *  asset id or an external https URL; the asset id wins. */
export interface AngkaObjectContent {
  name: string;
  question_text: string;
  image_asset_id: string | null;
  image_url?: string;
  question_audio_id: string | null;
  question_audio_url?: string;
}

export interface AngkaObjectRow extends AdminStatus {
  id: string;
  name: string;
  question_text: string;
  image_url: string;
  question_audio_url: string;
  /** Levels whose draft or any version use the object. */
  used_in: number;
}

export interface AngkaObjectDraft extends AngkaObjectRow {
  draft: AngkaObjectContent;
  draft_rev: number;
  assets: Record<string, Asset>;
}

export interface AngkaNumberContent {
  name: string;
  audio_asset_id: string | null;
  audio_url?: string;
  object_id: string | null;
}

/** One Kenal Angka number (1–20), with its draft: the tab edits inline. */
export interface AngkaNumberRow extends AdminStatus {
  value: number;
  name: string;
  audio_url: string;
  object_id: string | null;
  object_name: string;
  object_image_url: string;
  is_free: boolean;
  draft: AngkaNumberContent;
  draft_rev: number;
  assets: Record<string, Asset>;
}

export type AngkaLayout = 'scatter' | 'rows';

export interface AngkaLevelContent {
  name: string;
  prerequisite_id: string | null;
  range: { min: number; max: number };
  question_count: number;
  object_ids: string[];
  layout: AngkaLayout;
  /** First-try correct answers needed for 3 and 2 stars. */
  stars: { three: number; two: number };
  feedback: { success: string; retry: string; hint: string };
}

export interface AngkaLevelRow extends AdminStatus {
  id: string;
  name: string;
  sort_order: number;
  is_free: boolean;
  version: number | null;
  range: { min: number; max: number };
  question_count: number;
  object_names: string[];
  stars: { three: number; two: number };
  prerequisite_id: string | null;
  prerequisite_sort_order: number | null;
  prerequisite_name: string;
}

export interface AngkaLevelDraft extends AngkaLevelRow {
  draft: AngkaLevelContent;
  draft_rev: number;
}

/** An object as the app renders it. */
export interface AngkaObjectView {
  id: string;
  name: string;
  question_text: string;
  image_url: string;
  question_audio_url: string;
  hidden: boolean;
}

/** One generated question: pictures centred at points in a 320 × 180 box. */
export interface AngkaPreviewQuestion {
  count: number;
  size: number;
  layout: AngkaLayout;
  points: { x: number; y: number }[];
  object: AngkaObjectView | null;
}

export interface AngkaPreview {
  seed: number;
  questions: AngkaPreviewQuestion[];
  count_audio: Record<string, string>;
}

const data = <T>(r: { data: { data: T } }) => r.data.data;

export const angkaApi = {
  objects: {
    list: (): Promise<AngkaObjectRow[]> => api.get('/admin/angka/objects').then(data<AngkaObjectRow[]>),
    create: (name = ''): Promise<AngkaObjectDraft> =>
      api.post('/admin/angka/objects', { name }).then(data<AngkaObjectDraft>),
    getDraft: (id: string): Promise<AngkaObjectDraft> =>
      api.get(`/admin/angka/objects/${id}/draft`).then(data<AngkaObjectDraft>),
    saveDraft: (id: string, draft: AngkaObjectContent, draftRev: number): Promise<AngkaObjectDraft> =>
      api.put(`/admin/angka/objects/${id}/draft`, { draft, draft_rev: draftRev }).then(data<AngkaObjectDraft>),
    publish: (id: string) => api.post(`/admin/angka/objects/${id}/publish`),
    hide: (id: string) => api.post(`/admin/angka/objects/${id}/hide`),
    unhide: (id: string) => api.post(`/admin/angka/objects/${id}/unhide`),
    remove: (id: string) => api.delete(`/admin/angka/objects/${id}`),
  },
  numbers: {
    list: (): Promise<AngkaNumberRow[]> => api.get('/admin/angka/numbers').then(data<AngkaNumberRow[]>),
    saveDraft: (value: number, draft: AngkaNumberContent, draftRev: number): Promise<AngkaNumberRow> =>
      api.put(`/admin/angka/numbers/${value}/draft`, { draft, draft_rev: draftRev }).then(data<AngkaNumberRow>),
    publish: (value: number) => api.post(`/admin/angka/numbers/${value}/publish`),
    hide: (value: number) => api.post(`/admin/angka/numbers/${value}/hide`),
    unhide: (value: number) => api.post(`/admin/angka/numbers/${value}/unhide`),
    setFree: (value: number) => api.post(`/admin/angka/numbers/${value}/set-free`),
    unsetFree: (value: number) => api.post(`/admin/angka/numbers/${value}/unset-free`),
  },
  levels: {
    list: (): Promise<AngkaLevelRow[]> => api.get('/admin/angka/levels').then(data<AngkaLevelRow[]>),
    create: (): Promise<AngkaLevelDraft> => api.post('/admin/angka/levels').then(data<AngkaLevelDraft>),
    getDraft: (id: string): Promise<AngkaLevelDraft> =>
      api.get(`/admin/angka/levels/${id}/draft`).then(data<AngkaLevelDraft>),
    saveDraft: (id: string, draft: AngkaLevelContent, draftRev: number): Promise<AngkaLevelDraft> =>
      api.put(`/admin/angka/levels/${id}/draft`, { draft, draft_rev: draftRev }).then(data<AngkaLevelDraft>),
    preview: (id: string, draft: AngkaLevelContent, seed: number): Promise<AngkaPreview> =>
      api.post(`/admin/angka/levels/${id}/preview`, { draft, seed }).then(data<AngkaPreview>),
    versions: (id: string): Promise<ContentVersion[]> =>
      api.get(`/admin/angka/levels/${id}/versions`).then(data<ContentVersion[]>),
    publish: (id: string): Promise<{ version: number }> =>
      api.post(`/admin/angka/levels/${id}/publish`).then(data<{ version: number }>),
    rollback: (id: string, version: number): Promise<{ version: number }> =>
      api.post(`/admin/angka/levels/${id}/rollback/${version}`).then(data<{ version: number }>),
    hide: (id: string) => api.post(`/admin/angka/levels/${id}/hide`),
    unhide: (id: string) => api.post(`/admin/angka/levels/${id}/unhide`),
    setFree: (id: string) => api.post(`/admin/angka/levels/${id}/set-free`),
    unsetFree: (id: string) => api.post(`/admin/angka/levels/${id}/unset-free`),
    reorder: (ids: string[]) => api.put('/admin/angka/levels/order', { ids }),
    remove: (id: string) => api.delete(`/admin/angka/levels/${id}`),
  },
};
