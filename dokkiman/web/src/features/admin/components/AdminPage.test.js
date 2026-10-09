import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AccountMenu, AuthGate, AuthProvider } from '../../auth';
import { makeUser, mockFetch } from '../../../test-utils/mockFetch';
import { CurrentPath, renderAt } from '../../../test-utils/router';

const admin = makeUser({}, { email: 'boss@example.com', is_admin: true });

const STATS = {
  users: { total: 12, new_today: 2, new_7_days: 5, new_30_days: 12, active_7_days: 7,
    by_state: { trial: 8, free: 1, basic: 2, pro: 1 } },
  signups_by_day: Array.from({ length: 30 }, (_, i) => ({ day: `2026-09-${String(i + 1).padStart(2, '0')}`, count: i % 3 })),
  revenue: { paying: { basic: 2, pro: 1 }, paying_total: 3, mrr: 13.97, cancelling: 1, past_due: 0, granted: 0 },
  signature_requests: { total: 9, this_month: 4, senders: 3, by_status: { sent: 2, completed: 7 },
    ai_summaries: 5, ai_questions: 11 },
  documents: { total: 40, signed_pdfs: 6, ai_questions_30_days: 120 },
  recent_actions: [{ admin_email: 'boss@example.com', action: 'extend_trial', user_id: 'u-2',
    user_email: 'alice@example.com', detail: '+14 days', created_at: '2026-10-08T10:00:00+00:00' }],
  generated_at: '2026-10-09T12:00:00+00:00',
};

const ALICE = {
  id: 'u-2', email: 'alice@example.com', created_at: '2026-10-07T09:00:00+00:00', last_seen_at: null, state: 'trial',
  sign_in: 'google', subscription_status: null, cancel_at_period_end: false, signature_requests: 1, documents: 3,
  is_admin: false,
};

const aliceDetail = (overrides = {}) => ({
  ...ALICE,
  plan: { state: 'trial', trial_days_left: 20, trial_ends_at: '2026-10-29T09:00:00+00:00', usage: { questions_today: 2 } },
  billing: null,
  signature_request_usage: { limit: 3, used: 1 },
  signature_requests_by_status: { sent: 1 },
  recent_signature_requests: [{ id: 'req-1', status: 'sent', created_at: '2026-10-08T09:00:00+00:00', signers: 2 }],
  folders: 1, signed_pdfs: 0, ai_questions_total: 9, admin_actions: [],
  ...overrides,
});

const openAdmin = (routes = {}, user = admin, path = '/admin') => {
  const fetchMock = mockFetch({
    '/auth/me': { body: { user } },
    '/admin/stats': { body: STATS },
    '/admin/users': { body: { users: [ALICE], total: 1, page: 1, page_size: 50 } },
    '/admin/users/u-2': { body: { user: aliceDetail() } },
    ...routes,
  });
  renderAt(<AuthProvider><AuthGate><div /></AuthGate><CurrentPath /></AuthProvider>, path);
  return fetchMock;
};

test('the overview shows accounts, revenue and E-Sign stats', async () => {
  openAdmin();
  expect(await screen.findByRole('heading', { name: 'Admin' })).toBeInTheDocument();
  expect(await screen.findByText('Total accounts')).toBeInTheDocument();
  expect(screen.getByText('$13.97')).toBeInTheDocument();
  expect(screen.getByText('2 Basic · 1 Pro')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: /sign-ups in the last 30 days/ })).toBeInTheDocument();
  expect(screen.getByText('Signature requests')).toBeInTheDocument();
  expect(screen.getByText('Extended trial')).toBeInTheDocument();
});

test('people who aren’t admins are sent home', async () => {
  openAdmin({}, makeUser());
  await waitFor(() => expect(screen.getByTestId('current-path')).toHaveTextContent(/^\/$/));
  expect(screen.queryByRole('heading', { name: 'Admin' })).not.toBeInTheDocument();
});

test('the users tab lists and searches accounts', async () => {
  const fetchMock = openAdmin();
  fireEvent.click(await screen.findByRole('tab', { name: 'Users' }));
  const table = await screen.findByRole('table');
  expect(within(table).getByRole('button', { name: 'alice@example.com' })).toBeInTheDocument();
  expect(within(table).getByText('Trial')).toBeInTheDocument();

  fireEvent.change(screen.getByRole('searchbox', { name: 'Search accounts' }), { target: { value: 'alice' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes('/admin/users?') && url.includes('q=alice'))).toBe(true));
});

test('an admin can extend a trial from an account’s details', async () => {
  const fetchMock = openAdmin({
    '/admin/users/u-2/extend-trial': { body: { user: aliceDetail({ plan: { state: 'trial', trial_days_left: 34,
      trial_ends_at: '2026-11-12T09:00:00+00:00', usage: {} } }) } },
  });
  fireEvent.click(await screen.findByRole('tab', { name: 'Users' }));
  fireEvent.click(await screen.findByRole('button', { name: 'alice@example.com' }));
  const dialog = await screen.findByRole('dialog', { name: 'alice@example.com' });
  expect(within(dialog).getByText(/Trial, 20 days left/)).toBeInTheDocument();
  expect(within(dialog).getByText('req-1')).toBeInTheDocument();

  fireEvent.click(within(dialog).getByRole('button', { name: 'Extend trial' }));
  expect(await within(dialog).findByText('Trial extended by 14 days.')).toBeInTheDocument();
  expect(within(dialog).getByText(/Trial, 34 days left/)).toBeInTheDocument();
  const call = fetchMock.mock.calls.find(([url]) => url.endsWith('/admin/users/u-2/extend-trial'));
  expect(JSON.parse(call[1].body)).toEqual({ days: 14 });
});

test('Stripe subscribers can’t be given a plan here', async () => {
  openAdmin({
    '/admin/users/u-2': { body: { user: aliceDetail({ state: 'basic',
      plan: { state: 'basic', pro_until: '2026-11-08T00:00:00+00:00', usage: {} },
      billing: { has_subscription: true, status: 'active', interval: 'monthly', cancel_at_period_end: false,
        period_end: '2026-11-06T00:00:00+00:00' } }) } },
  });
  fireEvent.click(await screen.findByRole('tab', { name: 'Users' }));
  fireEvent.click(await screen.findByRole('button', { name: 'alice@example.com' }));
  const dialog = await screen.findByRole('dialog', { name: 'alice@example.com' });
  expect(await within(dialog).findByText(/pays through Stripe/)).toBeInTheDocument();
  expect(within(dialog).queryByRole('button', { name: 'Give plan' })).not.toBeInTheDocument();
});

test('the account menu links admins to the portal', async () => {
  mockFetch({ '/auth/me': { body: { user: admin } } });
  renderAt(<AuthProvider><AccountMenu /><CurrentPath /></AuthProvider>, '/app/documents');
  fireEvent.click(await screen.findByRole('button', { name: 'Account: boss@example.com' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Admin portal' }));
  expect(screen.getByTestId('current-path')).toHaveTextContent('/admin');
});

test('the account menu has no admin link for everyone else', async () => {
  mockFetch({ '/auth/me': { body: { user: makeUser() } } });
  renderAt(<AuthProvider><AccountMenu /></AuthProvider>, '/app/documents');
  fireEvent.click(await screen.findByRole('button', { name: 'Account: me@example.com' }));
  expect(screen.queryByRole('menuitem', { name: 'Admin portal' })).not.toBeInTheDocument();
});
