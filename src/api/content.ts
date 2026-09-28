import api from './client';

function contentApi(type: string) {
  const base = `/admin/content/${type}`;
  return {
    list: (params: { search?: string; page?: number; per_page?: number }) =>
      api.get(base, { params }).then((r) => r.data),
    get: (id: string) => api.get(`${base}/${id}`).then((r) => r.data.data),
    create: (data: unknown) => api.post(base, data).then((r) => r.data.data),
    update: (id: string, data: unknown) => api.put(`${base}/${id}`, data).then((r) => r.data.data),
    delete: (id: string) => api.delete(`${base}/${id}`),
    toggleVisibility: (id: string, hidden: boolean) =>
      api.patch(`${base}/${id}/visibility`, { hidden }).then((r) => r.data),
  };
}

// AR cards and dongeng can be made free (or premium again) without touching
// their product, orders or earlier buyers. It is its own endpoint, so saving
// an item never changes it by accident.
function contentApiWithFree(type: string) {
  return {
    ...contentApi(type),
    setFree: (id: string, is_free: boolean) =>
      api.patch(`/admin/content/${type}/${id}/free`, { is_free }).then((r) => r.data),
  };
}

export const fairyTalesApi = contentApiWithFree('fairy-tales');
export const arCardsApi = contentApiWithFree('ar-cards');
export const tracingApi = contentApi('tracing-items');
export const countingApi = contentApi('counting-questions');
export const badgesApi = contentApi('badges');
export const categoriesApi = contentApi('categories');

export const bannersApi = {
  ...contentApi('banners'),
  toggleActive: (id: string, is_active: boolean) =>
    api.patch(`/admin/content/banners/${id}/active`, { is_active }).then((r) => r.data),
};

export const arCardCategoriesApi = contentApi('ar-card-categories');

export const dongengCategoriesApi = contentApi('dongeng-categories');

export const fairyTalePagesApi = {
  list: (fairyTaleId: string) =>
    api.get('/admin/content/dongen-pages', { params: { dongeng_id: fairyTaleId } }).then((r) => r.data.data as unknown[]),
  create: (fairyTaleId: string, data: unknown) =>
    api.post('/admin/content/dongen-pages', { ...(data as object), dongeng_id: fairyTaleId }).then((r) => r.data.data),
  update: (_fairyTaleId: string, pageId: string, data: unknown) =>
    api.put(`/admin/content/dongen-pages/${pageId}`, data).then((r) => r.data.data),
  delete: (_fairyTaleId: string, pageId: string) =>
    api.delete(`/admin/content/dongen-pages/${pageId}`),
};
