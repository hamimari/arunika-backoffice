import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import api from '../../api/client';
import { renderHook } from '@testing-library/react';
import { useAuthStore, useCanPublish } from '../../store/authStore';

/**
 * The auth store decides whether ProtectedRoute lets an admin through.
 *
 * Its subtlety is documented in the store itself: the token is read from
 * localStorage at store-creation time rather than in an effect, because
 * deferring it meant ProtectedRoute's first render always saw
 * isAuthenticated=false and bounced to /login — every hard reload looked like
 * a forced logout regardless of actual token expiry.
 */

const mock = new MockAdapter(api);
const bareAxios = new MockAdapter(axios);

beforeEach(() => {
  mock.reset();
  bareAxios.reset();
  localStorage.clear();
  useAuthStore.setState({ accessToken: null, isAuthenticated: false });
});

afterEach(() => {
  mock.reset();
  bareAxios.reset();
  localStorage.clear();
});

describe('authStore', () => {
  it('should_persist_credentials_and_authenticate_on_login', async () => {
    mock.onPost('/admin/auth/login').reply(200, {
      access_token: 'access-abc',
      refresh_token: 'refresh-abc',
      admin_id: 'admin-1',
    });

    await useAuthStore.getState().login('admin@example.test', 'secret');

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().accessToken).toBe('access-abc');
    // All three are needed: client.ts's refresh flow reads the refresh token
    // and admin id back out of storage.
    expect(localStorage.getItem('admin_access_token')).toBe('access-abc');
    expect(localStorage.getItem('admin_refresh_token')).toBe('refresh-abc');
    expect(localStorage.getItem('admin_id')).toBe('admin-1');
  });

  it('should_stay_signed_out_when_login_fails', async () => {
    mock.onPost('/admin/auth/login').reply(401, { error: 'invalid credentials' });

    await expect(
      useAuthStore.getState().login('admin@example.test', 'wrong'),
    ).rejects.toThrow();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(localStorage.getItem('admin_access_token')).toBeNull();
  });

  it('should_clear_everything_on_logout', async () => {
    localStorage.setItem('admin_access_token', 'access-abc');
    localStorage.setItem('admin_refresh_token', 'refresh-abc');
    localStorage.setItem('admin_id', 'admin-1');
    useAuthStore.setState({ accessToken: 'access-abc', isAuthenticated: true });
    mock.onPost('/admin/auth/logout').reply(200, {});

    await useAuthStore.getState().logout();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(localStorage.getItem('admin_access_token')).toBeNull();
    expect(localStorage.getItem('admin_refresh_token')).toBeNull();
    expect(localStorage.getItem('admin_id')).toBeNull();
  });

  it('should_clear_the_local_session_even_when_the_logout_call_fails', async () => {
    localStorage.setItem('admin_access_token', 'access-abc');
    useAuthStore.setState({ accessToken: 'access-abc', isAuthenticated: true });
    mock.onPost('/admin/auth/logout').reply(500, { error: 'boom' });

    await useAuthStore.getState().logout();

    // Logging out must always work locally: a server that cannot be reached
    // is no reason to leave an admin appearing signed in.
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(localStorage.getItem('admin_access_token')).toBeNull();
  });

  it('should_restore_an_existing_session_from_storage', () => {
    localStorage.setItem('admin_access_token', 'access-from-reload');

    useAuthStore.getState().initFromStorage();

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().accessToken).toBe('access-from-reload');
  });

  it('should_report_signed_out_when_storage_is_empty', () => {
    useAuthStore.getState().initFromStorage();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('should_remember_the_content_role_and_forget_it_on_logout', async () => {
    mock.onPost('/admin/auth/login').reply(200, {
      access_token: 'a',
      refresh_token: 'r',
      admin_id: 'admin-1',
      role: 'editor',
    });
    mock.onPost('/admin/auth/logout').reply(200, {});

    await useAuthStore.getState().login('editor@example.test', 'secret');
    expect(useAuthStore.getState().role).toBe('editor');
    expect(localStorage.getItem('admin_role')).toBe('editor');

    await useAuthStore.getState().logout();
    expect(useAuthStore.getState().role).toBeNull();
    expect(localStorage.getItem('admin_role')).toBeNull();
  });

  it('should_restore_the_role_from_storage', () => {
    localStorage.setItem('admin_access_token', 't');
    localStorage.setItem('admin_role', 'publisher');
    useAuthStore.getState().initFromStorage();
    expect(useAuthStore.getState().role).toBe('publisher');
    useAuthStore.getState().setRole(null);
    expect(localStorage.getItem('admin_role')).toBeNull();
  });

  it('should_allow_publishing_unless_the_role_is_editor', () => {
    useAuthStore.setState({ role: 'editor' });
    expect(renderHook(() => useCanPublish()).result.current).toBe(false);
    useAuthStore.setState({ role: 'publisher' });
    expect(renderHook(() => useCanPublish()).result.current).toBe(true);
    // A session from before roles existed: the backend still decides.
    useAuthStore.setState({ role: null });
    expect(renderHook(() => useCanPublish()).result.current).toBe(true);
  });

  it('should_update_the_role_when_a_token_refresh_reports_one', async () => {
    localStorage.setItem('admin_access_token', 'expired');
    localStorage.setItem('admin_refresh_token', 'refresh-abc');
    localStorage.setItem('admin_id', 'admin-1');
    useAuthStore.setState({ role: 'publisher' });
    let attempt = 0;
    mock.onGet('/admin/huruf/letters').reply(() => {
      attempt += 1;
      return attempt === 1 ? [401, {}] : [200, { data: [] }];
    });
    bareAxios.onPost(/\/admin\/auth\/refresh$/).reply(200, { access_token: 'fresh', role: 'editor' });

    await api.get('/admin/huruf/letters');

    expect(useAuthStore.getState().role).toBe('editor');
    expect(localStorage.getItem('admin_role')).toBe('editor');
  });
});
