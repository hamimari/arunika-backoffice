import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';

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
});
