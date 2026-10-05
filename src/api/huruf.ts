import api from './client';
import type { Asset } from './assets';

/** One stroke of a tracing guide: an absolute M/L/Q/C path on the 300 grid. */
export interface HurufStroke {
  order: number;
  label: string;
  path: string;
}

/** A letter's editable content (drafts and published versions share it). */
export interface HurufContent {
  upper: string;
  lower: string;
  /** Each media slot holds an uploaded asset id or an external https URL;
   *  the asset id wins when both are set. */
  kenali: { word: string; highlight: number[]; image_asset_id: string | null; image_url?: string };
  dengar: {
    letter_audio_id: string | null;
    word_audio_id: string | null;
    letter_audio_url?: string;
    word_audio_url?: string;
  };
  tebalkan: {
    grid: number;
    lower_required: boolean;
    upper: HurufStroke[];
    lower: HurufStroke[];
  };
  feedback: { success: string; retry: string; hint: string };
}

export type LetterStatus = 'draft' | 'published' | 'hidden';

export interface HurufLetterRow {
  id: string;
  upper: string;
  lower: string;
  sort_order: number;
  is_free: boolean;
  status: LetterStatus;
  has_unpublished_changes: boolean;
  version: number | null;
  word: string;
  image_url: string;
  audio_count: number;
  stroke_count: number;
  updated_by: string;
  updated_at: string;
}

export interface HurufDraft extends HurufLetterRow {
  draft: HurufContent;
  draft_rev: number;
  /** Assets the draft references, by id. */
  assets: Record<string, Asset>;
}

/** Letter content as the app renders it (the preview endpoint). */
export interface HurufLetterView {
  id: string;
  version: number;
  upper: string;
  lower: string;
  kenali: { word: string; highlight: number[]; image_url: string };
  dengar: { letter_audio_url: string; word_audio_url: string };
  tebalkan: HurufContent['tebalkan'];
  feedback: HurufContent['feedback'];
}

export interface HurufVersion {
  id: string;
  version: number;
  published_by: string;
  published_at: string;
  is_current: boolean;
}

/** A publish refused by validation: each field by its JSON path. */
export interface FieldError {
  path: string;
  code: string;
}

export const hurufApi = {
  list: (): Promise<HurufLetterRow[]> =>
    api.get('/admin/huruf/letters').then((r) => r.data.data),
  getDraft: (id: string): Promise<HurufDraft> =>
    api.get(`/admin/huruf/letters/${id}/draft`).then((r) => r.data.data),
  saveDraft: (id: string, draft: HurufContent, draftRev: number): Promise<HurufDraft> =>
    api
      .put(`/admin/huruf/letters/${id}/draft`, { draft, draft_rev: draftRev })
      .then((r) => r.data.data),
  preview: (id: string, draft: HurufContent): Promise<HurufLetterView> =>
    api.post(`/admin/huruf/letters/${id}/preview`, draft).then((r) => r.data.data),
  versions: (id: string): Promise<HurufVersion[]> =>
    api.get(`/admin/huruf/letters/${id}/versions`).then((r) => r.data.data),
  publish: (id: string): Promise<{ version: number }> =>
    api.post(`/admin/huruf/letters/${id}/publish`).then((r) => r.data.data),
  rollback: (id: string, version: number): Promise<{ version: number }> =>
    api.post(`/admin/huruf/letters/${id}/rollback/${version}`).then((r) => r.data.data),
  hide: (id: string) => api.post(`/admin/huruf/letters/${id}/hide`),
  unhide: (id: string) => api.post(`/admin/huruf/letters/${id}/unhide`),
  setFree: (id: string) => api.post(`/admin/huruf/letters/${id}/set-free`),
  unsetFree: (id: string) => api.post(`/admin/huruf/letters/${id}/unset-free`),
  reorder: (ids: string[]) => api.put('/admin/huruf/order', { ids }),
};

/** The backend's 422 VALIDATION_FAILED fields, or [] for any other error. */
export function validationFields(err: unknown): FieldError[] {
  const data = (err as { response?: { data?: { code?: string; fields?: FieldError[] } } })
    ?.response?.data;
  return data?.code === 'VALIDATION_FAILED' ? (data.fields ?? []) : [];
}

/** The backend's error code (e.g. DRAFT_CONFLICT), if any. */
export function errorCode(err: unknown): string | undefined {
  return (err as { response?: { data?: { code?: string } } })?.response?.data?.code;
}
