import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import api from '../../api/client';

/**
 * The shared axios client carries every admin request. Two behaviours here
 * decide whether an admin stays signed in:
 *
 *  - the request interceptor attaches the access token;
 *  - the response interceptor refreshes once on a 401 and retries, rather
 *    than logging out. Access tokens live 15 minutes, so a client that logs
 *    out on every 401 signs the admin out several times an hour.
 */

const mock = new MockAdapter(api);

// authApi.refresh deliberately uses a bare axios.post rather than the shared
// `api` instance, so that the refresh call does not pass through the very 401
// interceptor that triggers it. That means it needs its own mock adapter —
// mocking `api` alone lets the refresh escape to a real network call, which
// is how the first version of this file mistook correct behaviour for a bug.
const bareAxios = new MockAdapter(axios);
const REFRESH = /\/admin\/auth\/refresh$/;

// window.location.href is assigned on forced logout; jsdom would navigate.
const originalLocation = window.location;

beforeEach(() => {
  mock.reset();
  bareAxios.reset();
  localStorage.clear();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...originalLocation, href: '' },
  });
});

afterEach(() => {
  mock.reset();
  bareAxios.reset();
  localStorage.clear();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: originalLocation,
  });
});

describe('api client — request interceptor', () => {
  it('should_attach_the_access_token_when_one_is_stored', async () => {
    localStorage.setItem('admin_access_token', 'token-abc');
    mock.onGet('/admin/users').reply(200, { data: [] });

    await api.get('/admin/users');

    expect(mock.history.get[0].headers?.Authorization).toBe('Bearer token-abc');
  });

  it('should_send_no_authorization_header_when_signed_out', async () => {
    mock.onGet('/admin/users').reply(200, { data: [] });

    await api.get('/admin/users');

    expect(mock.history.get[0].headers?.Authorization).toBeUndefined();
  });
});

describe('api client — 401 handling', () => {
  it('should_refresh_once_and_retry_the_original_request', async () => {
    localStorage.setItem('admin_access_token', 'expired');
    localStorage.setItem('admin_refresh_token', 'refresh-abc');
    localStorage.setItem('admin_id', 'admin-1');

    let attempt = 0;
    mock.onGet('/admin/users').reply(() => {
      attempt += 1;
      // First call is rejected as expired; the retry succeeds.
      return attempt === 1 ? [401, { error: 'token expired' }] : [200, { data: ['ok'] }];
    });
    bareAxios.onPost(REFRESH).reply(200, {
      access_token: 'fresh-token',
      refresh_token: 'refresh-def',
    });

    const res = await api.get('/admin/users');

    expect(res.data).toEqual({ data: ['ok'] });
    expect(attempt).toBe(2);
    // The refreshed token is stored for subsequent requests...
    expect(localStorage.getItem('admin_access_token')).toBe('fresh-token');
    // ...and the admin was not signed out.
    expect(window.location.href).toBe('');
  });

  it('should_sign_out_when_the_refresh_itself_fails', async () => {
    localStorage.setItem('admin_access_token', 'expired');
    localStorage.setItem('admin_refresh_token', 'refresh-abc');
    localStorage.setItem('admin_id', 'admin-1');

    mock.onGet('/admin/users').reply(401, { error: 'token expired' });
    bareAxios.onPost(REFRESH).reply(401, { error: 'refresh expired' });

    await expect(api.get('/admin/users')).rejects.toThrow();

    // The session is genuinely over: credentials cleared, redirected.
    expect(localStorage.getItem('admin_access_token')).toBeNull();
    expect(localStorage.getItem('admin_refresh_token')).toBeNull();
    expect(window.location.href).toBe('/login');
  });

  it('should_sign_out_when_there_is_no_refresh_token_to_use', async () => {
    localStorage.setItem('admin_access_token', 'expired');
    mock.onGet('/admin/users').reply(401, { error: 'token expired' });

    await expect(api.get('/admin/users')).rejects.toThrow();

    expect(window.location.href).toBe('/login');
  });

  it('should_not_retry_more_than_once_for_the_same_request', async () => {
    localStorage.setItem('admin_access_token', 'expired');
    localStorage.setItem('admin_refresh_token', 'refresh-abc');
    localStorage.setItem('admin_id', 'admin-1');

    let attempts = 0;
    // The endpoint 401s even after a successful refresh.
    mock.onGet('/admin/users').reply(() => {
      attempts += 1;
      return [401, { error: 'still unauthorized' }];
    });
    bareAxios.onPost(REFRESH).reply(200, {
      access_token: 'fresh-token',
      refresh_token: 'refresh-def',
    });

    await expect(api.get('/admin/users')).rejects.toThrow();

    // Without the _retried guard this recurses until the stack blows.
    expect(attempts).toBe(2);
    expect(window.location.href).toBe('/login');
  });

  it('should_not_attempt_a_refresh_when_the_login_call_itself_401s', async () => {
    mock.onPost('/admin/auth/login').reply(401, { error: 'invalid credentials' });

    await expect(api.post('/admin/auth/login', {})).rejects.toThrow();

    // Wrong credentials must surface as a failed login, not as a refresh
    // attempt against a session that never existed.
    expect(bareAxios.history.post.filter((r) => r.url?.includes('/refresh'))).toHaveLength(0);
  });

  it('should_share_one_refresh_across_concurrent_401s', async () => {
    localStorage.setItem('admin_access_token', 'expired');
    localStorage.setItem('admin_refresh_token', 'refresh-abc');
    localStorage.setItem('admin_id', 'admin-1');

    const seen: Record<string, number> = { users: 0, payments: 0 };
    mock.onGet('/admin/users').reply(() => {
      seen.users += 1;
      return seen.users === 1 ? [401, {}] : [200, { data: 'users' }];
    });
    mock.onGet('/admin/payments').reply(() => {
      seen.payments += 1;
      return seen.payments === 1 ? [401, {}] : [200, { data: 'payments' }];
    });

    let refreshCalls = 0;
    bareAxios.onPost(REFRESH).reply(() => {
      refreshCalls += 1;
      return [200, { access_token: 'fresh-token', refresh_token: 'refresh-def' }];
    });

    await Promise.all([api.get('/admin/users'), api.get('/admin/payments')]);

    // A page that fires several requests at once must not stampede the
    // refresh endpoint — and must not have later refreshes invalidate the
    // token an earlier one just stored.
    expect(refreshCalls).toBe(1);
  });

  it('should_pass_through_errors_that_are_not_401', async () => {
    localStorage.setItem('admin_access_token', 'token-abc');
    mock.onGet('/admin/users').reply(500, { error: 'boom' });

    await expect(api.get('/admin/users')).rejects.toMatchObject({
      response: { status: 500 },
    });

    // A server fault is not a session problem.
    expect(localStorage.getItem('admin_access_token')).toBe('token-abc');
    expect(window.location.href).toBe('');
  });
});

describe('api client — configuration', () => {
  it('should_send_json_by_default', () => {
    expect(api.defaults.headers['Content-Type']).toBe('application/json');
  });

  it('should_target_the_configured_backend', () => {
    expect(api.defaults.baseURL).toBeTruthy();
  });
});
