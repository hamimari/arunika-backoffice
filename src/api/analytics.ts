import api from './client';

const base = '/admin/analytics';

/** Tumbuh Kembang metrics — aggregate counts only, never per-child data. */
export interface GrowthMetrics {
  days: number;
  active_parents: number;
  activated_parents: number;
  activation_rate: number;
  habit_rate: number;
  created_measurements: number;
  corrections_per_100: number;
  outlier_confirmed_share: number;
  /** Children per latest category: `hfa` (height) and `wfa` (weight). */
  category_distribution: { hfa: Record<string, number>; wfa: Record<string, number> };
}

export const analyticsApi = {
  getDAU: (days = 30) => api.get(`${base}/dau`, { params: { days } }).then((r) => r.data.data),
  getNewUsers: (days = 30) => api.get(`${base}/new-users`, { params: { days } }).then((r) => r.data.data),
  getPopularFeatures: () => api.get(`${base}/popular-features`).then((r) => r.data.data),
  getPayments: (from?: string, to?: string) =>
    api.get(`${base}/payments`, { params: { from, to } }).then((r) => r.data.data),
  getGrowth: (days = 30): Promise<GrowthMetrics> =>
    api.get(`${base}/growth`, { params: { days } }).then((r) => r.data.data),
  getSubscriptionStats: () =>
    api.get(`${base}/subscription-stats`).then((r) => r.data),
};
