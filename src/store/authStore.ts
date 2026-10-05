import { create } from 'zustand';
import { authApi } from '../api/auth';
import type { AdminRole } from '../api/auth';
import { setRoleListener } from '../api/client';

interface AuthState {
  accessToken: string | null;
  isAuthenticated: boolean;
  /** Null for a session from before roles existed; the backend still decides. */
  role: AdminRole | null;
  setRole: (role: AdminRole | null) => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  initFromStorage: () => void;
}

// Read synchronously at store-creation time (not in a useEffect) so the very
// first render already reflects a token that's already in localStorage.
// Deferring this to an effect meant ProtectedRoute's first render always saw
// isAuthenticated=false and bounced to /login before the effect could run —
// i.e. every hard page reload looked like a forced logout, independent of
// actual token expiry.
const storedToken = localStorage.getItem('admin_access_token');
const storedRole = localStorage.getItem('admin_role') as AdminRole | null;

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: storedToken,
  isAuthenticated: !!storedToken,
  role: storedRole,

  setRole: (role) => {
    if (role) localStorage.setItem('admin_role', role);
    else localStorage.removeItem('admin_role');
    set({ role });
  },

  initFromStorage: () => {
    const token = localStorage.getItem('admin_access_token');
    const role = localStorage.getItem('admin_role') as AdminRole | null;
    set({ accessToken: token, isAuthenticated: !!token, role });
  },

  login: async (email, password) => {
    const res = await authApi.login(email, password);
    localStorage.setItem('admin_access_token', res.access_token);
    localStorage.setItem('admin_refresh_token', res.refresh_token);
    localStorage.setItem('admin_id', res.admin_id);
    if (res.role) localStorage.setItem('admin_role', res.role);
    set({ accessToken: res.access_token, isAuthenticated: true, role: res.role ?? null });
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch {
      // best effort
    }
    localStorage.removeItem('admin_access_token');
    localStorage.removeItem('admin_refresh_token');
    localStorage.removeItem('admin_id');
    localStorage.removeItem('admin_role');
    set({ accessToken: null, isAuthenticated: false, role: null });
  },
}));

// A token refresh reports the admin's current role; mirror it here.
setRoleListener((role) => useAuthStore.getState().setRole(role));

/**
 * Whether the signed-in admin may publish, hide, reorder, roll back and
 * manage roles. Unknown (pre-role sessions) is treated as allowed — the
 * backend re-checks every publisher action against the database anyway.
 */
export const useCanPublish = () => useAuthStore((s) => s.role !== 'editor');
