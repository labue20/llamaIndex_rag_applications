/**
 * Replace global.fetch with a fake backend for tests.
 *
 * routes maps a path (e.g. '/auth/me') to either a response spec
 * { status, body } (JSON) or { file: Blob } (a download), or a function
 * (url, options) => spec. Unknown paths
 * answer 404. Returns the jest mock so tests can inspect calls.
 */
export const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(body),
  text: () => Promise.resolve(JSON.stringify(body)),
  headers: { get: () => 'application/json' },
});

// Sign-in options when a test doesn't say: email + password (as in local
// development), so most tests can fill in the form. Google tests override it.
const DEFAULT_ROUTES = {
  '/auth/config': { body: { google_client_id: '', password_login: true } },
};

export const mockFetch = (routes) => {
  const allRoutes = { ...DEFAULT_ROUTES, ...routes };
  const fetchMock = jest.fn((url, options = {}) => {
    const path = new URL(url, 'http://localhost').pathname;
    const route = allRoutes[path];
    const spec = typeof route === 'function' ? route(url, options) : route;
    if (!spec) return Promise.resolve(jsonResponse(404, { error: 'Not found' }));
    if (spec.file) {
      // A file download: { file: Blob }
      return Promise.resolve({ ok: true, status: 200, blob: () => Promise.resolve(spec.file), headers: { get: () => null } });
    }
    return Promise.resolve(jsonResponse(spec.status ?? 200, spec.body ?? {}));
  });
  global.fetch = fetchMock;
  return fetchMock;
};

export const makeUser = (planOverrides = {}, userOverrides = {}) => ({
  id: 'user-1',
  email: 'me@example.com',
  has_password: true,
  ...userOverrides,
  plan: {
    plan: 'trial',
    state: 'trial',
    trial_days_left: 5,
    limits: { max_documents: 10, max_questions_per_day: 50 },
    usage: { questions_today: 3 },
    support_email: '',
    ...planOverrides,
  },
});
