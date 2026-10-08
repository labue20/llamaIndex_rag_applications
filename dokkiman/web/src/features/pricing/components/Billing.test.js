import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AuthGate, AuthProvider, AccountMenu, TrialBadge } from '../../auth';
import { makeUser, mockFetch } from '../../../test-utils/mockFetch';
import { CurrentPath, renderAt } from '../../../test-utils/router';
import { browser } from '../billing';

const PLAN = {
  trial_days: 7, trial_max_documents: 10, trial_max_questions_per_day: 50,
  free_max_documents: 3, free_max_questions_per_day: 10, free_conversions_per_day: 20,
  basic_price_monthly: 1.99, basic_price_yearly: 19.99, basic_max_documents: 25, basic_max_questions_per_day: 50,
  pro_price_monthly: 9, pro_price_yearly: 90, pro_fair_use_questions_per_day: 150, yearly_billing: true,
  support_email: 'help@example.com', online_payments: true,
};
const CHECKOUT_URL = 'https://checkout.stripe.test/c';
const PORTAL_URL = 'https://billing.stripe.test/p';

const proUser = (billing = { has_subscription: true, status: 'active', interval: 'monthly', cancel_at_period_end: false,
  period_end: '2027-03-15T12:00:00+00:00' }) =>
  makeUser({ plan: 'pro', state: 'pro', pro_until: '2027-03-17T12:00:00+00:00', billing });

const openSite = (route, routes) => {
  const fetchMock = mockFetch({
    '/plans': { body: PLAN },
    '/billing/checkout': { body: { url: CHECKOUT_URL } },
    '/billing/portal': { body: { url: PORTAL_URL } },
    ...routes,
  });
  renderAt(
    <AuthProvider>
      <AuthGate>
        <AccountMenu />
      </AuthGate>
      <CurrentPath />
    </AuthProvider>,
    route
  );
  return fetchMock;
};

const posted = (fetchMock, path) =>
  fetchMock.mock.calls.filter(([url]) => url.endsWith(path)).map(([, options]) => JSON.parse(options.body));

const proCard = () => screen.getByRole('region', { name: 'Pro' });
const basicCard = () => screen.getByRole('region', { name: 'Basic' });
const basicUser = () => makeUser({ plan: 'basic', state: 'basic', pro_until: '2027-03-17T12:00:00+00:00',
  billing: { has_subscription: true, status: 'active', interval: 'monthly', cancel_at_period_end: false,
    period_end: '2027-03-15T12:00:00+00:00' } });

let go;
beforeEach(() => {
  go = jest.spyOn(browser, 'go').mockImplementation(() => {});
});

test('a signed-in user upgrades through Stripe checkout for the chosen period', async () => {
  const fetchMock = openSite('/pricing', { '/auth/me': { body: { user: makeUser() } } });
  await within(await screen.findByRole('region', { name: 'Pro' })).findByText(/Secure payment with Stripe/);

  fireEvent.click(screen.getByRole('button', { name: /Yearly/ }));
  fireEvent.click(within(proCard()).getByRole('button', { name: 'Upgrade to Pro' }));

  await waitFor(() => expect(go).toHaveBeenCalledWith(CHECKOUT_URL));
  expect(posted(fetchMock, '/billing/checkout')).toEqual([{ plan: 'pro', billing: 'yearly' }]);
  expect(within(proCard()).getByRole('button', { name: 'Opening secure checkout…' })).toBeDisabled();
  // Only the clicked plan says it's opening; the other waits
  expect(within(basicCard()).getByRole('button', { name: 'Upgrade to Basic' })).toBeDisabled();
});

test('a signed-in user can check out Basic', async () => {
  const fetchMock = openSite('/pricing', { '/auth/me': { body: { user: makeUser() } } });
  await within(await screen.findByRole('region', { name: 'Basic' })).findByText(/Secure payment with Stripe/);
  fireEvent.click(within(basicCard()).getByRole('button', { name: 'Upgrade to Basic' }));
  await waitFor(() => expect(go).toHaveBeenCalledWith(CHECKOUT_URL));
  expect(posted(fetchMock, '/billing/checkout')).toEqual([{ plan: 'basic', billing: 'monthly' }]);
});

test('Basic subscribers manage Basic and switch to Pro in billing management', async () => {
  const fetchMock = openSite('/pricing', { '/auth/me': { body: { user: basicUser() } } });
  expect(await within(await screen.findByRole('region', { name: 'Basic' })).findByRole('button', { name: 'Manage billing' }))
    .toBeInTheDocument();
  fireEvent.click(within(proCard()).getByRole('button', { name: 'Switch to Pro' }));
  await waitFor(() => expect(go).toHaveBeenCalledWith(PORTAL_URL));
  expect(posted(fetchMock, '/billing/checkout')).toEqual([]);
});

test('Pro subscribers can switch down to Basic in billing management', async () => {
  openSite('/pricing', { '/auth/me': { body: { user: proUser() } } });
  fireEvent.click(await within(await screen.findByRole('region', { name: 'Basic' })).findByRole('button', { name: 'Switch to Basic' }));
  await waitFor(() => expect(go).toHaveBeenCalledWith(PORTAL_URL));
});

test('visitors sign up first and come back to the pricing page', async () => {
  openSite('/pricing', {
    '/auth/me': { status: 401 },
    '/auth/signup': { status: 201, body: { user: makeUser() } },
  });
  await within(await screen.findByRole('region', { name: 'Pro' })).findByText(/Secure payment with Stripe/);
  fireEvent.click(within(proCard()).getByRole('button', { name: 'Upgrade to Pro' }));
  expect(screen.getByTestId('current-path')).toHaveTextContent('/signup');
  expect(go).not.toHaveBeenCalled();

  fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'me@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a long passphrase' } });
  fireEvent.click(screen.getByRole('button', { name: 'Start free trial' }));
  await waitFor(() => expect(screen.getByTestId('current-path')).toHaveTextContent('/pricing'));
});

test('checkout errors are shown and the button works again', async () => {
  openSite('/pricing', {
    '/auth/me': { body: { user: makeUser() } },
    '/billing/checkout': { status: 502, body: { error: "Couldn't start checkout. Please try again in a moment." } },
  });
  await within(await screen.findByRole('region', { name: 'Pro' })).findByText(/Secure payment with Stripe/);
  fireEvent.click(within(proCard()).getByRole('button', { name: 'Upgrade to Pro' }));
  expect(await within(proCard()).findByRole('alert')).toHaveTextContent("Couldn't start checkout");
  expect(within(proCard()).getByRole('button', { name: 'Upgrade to Pro' })).toBeEnabled();
  expect(go).not.toHaveBeenCalled();
});

test('someone who already subscribes is sent to billing management instead', async () => {
  const fetchMock = openSite('/pricing', {
    '/auth/me': { body: { user: makeUser() } },
    '/billing/checkout': { status: 409, body: { error: 'You already have Pro.', code: 'already_subscribed' } },
  });
  await within(await screen.findByRole('region', { name: 'Pro' })).findByText(/Secure payment with Stripe/);
  fireEvent.click(within(proCard()).getByRole('button', { name: 'Upgrade to Pro' }));
  await waitFor(() => expect(go).toHaveBeenCalledWith(PORTAL_URL));
  expect(posted(fetchMock, '/billing/portal')).toHaveLength(1);
});

test('subscribers get Manage billing on the pricing page', async () => {
  openSite('/pricing', { '/auth/me': { body: { user: proUser() } } });
  fireEvent.click(await within(await screen.findByRole('region', { name: 'Pro' })).findByRole('button', { name: 'Manage billing' }));
  await waitFor(() => expect(go).toHaveBeenCalledWith(PORTAL_URL));
});

test('the account menu has Manage billing for subscribers only', async () => {
  openSite('/app/documents', { '/auth/me': { body: { user: proUser() } } });
  fireEvent.click(await screen.findByRole('button', { name: 'Account: me@example.com' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Manage billing' }));
  await waitFor(() => expect(go).toHaveBeenCalledWith(PORTAL_URL));
});

test('no Manage billing for accounts that never paid online', async () => {
  openSite('/app/documents', { '/auth/me': { body: { user: makeUser() } } });
  fireEvent.click(await screen.findByRole('button', { name: 'Account: me@example.com' }));
  expect(screen.queryByRole('menuitem', { name: 'Manage billing' })).toBeNull();
});

test.each([
  [false, 'Pro · renews on March 15, 2027'],
  [true, 'Pro until March 15, 2027'],
])('the Pro badge says whether it renews (cancelled: %s)', async (cancelled, title) => {
  mockFetch({ '/auth/me': { body: { user: proUser({ has_subscription: true, status: 'active', interval: 'monthly', cancel_at_period_end: cancelled, period_end: '2027-03-15T12:00:00+00:00' }) } } });
  renderAt(
    <AuthProvider>
      <TrialBadge />
    </AuthProvider>,
    '/app/documents'
  );
  expect(await screen.findByText('Pro')).toHaveAttribute('title', title);
});

test('a cancelled checkout says nobody was charged, and the FAQ explains cancelling', async () => {
  openSite('/pricing?upgrade=cancelled', { '/auth/me': { status: 401 } });
  expect(await screen.findByText(/Checkout was cancelled, and you haven.t been charged/)).toBeInTheDocument();
  expect(await screen.findByText('Can I cancel my plan?')).toBeInTheDocument();
  expect(screen.getByText(/Basic and Pro renew automatically until you cancel/)).toBeInTheDocument();
});

test('the Upgrade dialog starts monthly checkout', async () => {
  const fetchMock = openSite('/app/documents', {
    '/auth/me': { body: { user: makeUser({ state: 'free' }) } },
  });
  await screen.findByRole('button', { name: 'Account: me@example.com' });
  const { apiFetch } = require('../../../shared/services/apiClient');
  // Any plan limit (402) opens the dialog
  fetchMock.mockImplementationOnce(() => Promise.resolve({ ok: false, status: 402, json: () => Promise.resolve({}) }));
  await act(async () => { await apiFetch('/chat', { method: 'POST' }); });

  const dialog = await screen.findByRole('dialog');
  fireEvent.click(await within(dialog).findByRole('button', { name: 'Upgrade to Pro · $9/month' }));
  await waitFor(() => expect(go).toHaveBeenCalledWith(CHECKOUT_URL));
  expect(posted(fetchMock, '/billing/checkout')).toEqual([{ plan: 'pro', billing: 'monthly' }]);
});

const openUpgradeDialog = async (user) => {
  const fetchMock = openSite('/app/documents', { '/auth/me': { body: { user } } });
  await screen.findByRole('button', { name: 'Account: me@example.com' });
  const { apiFetch } = require('../../../shared/services/apiClient');
  fetchMock.mockImplementationOnce(() => Promise.resolve({ ok: false, status: 402, json: () => Promise.resolve({}) }));
  await act(async () => { await apiFetch('/chat', { method: 'POST' }); });
  return { fetchMock, dialog: await screen.findByRole('dialog') };
};

test('the Upgrade dialog also offers Basic', async () => {
  const { fetchMock, dialog } = await openUpgradeDialog(makeUser({ state: 'free' }));
  expect(dialog).toHaveTextContent('Or start smaller with Basic at $1.99 a month: 25 documents and 50 questions a day.');
  fireEvent.click(await within(dialog).findByRole('button', { name: 'Get Basic · $1.99/month' }));
  await waitFor(() => expect(go).toHaveBeenCalledWith(CHECKOUT_URL));
  expect(posted(fetchMock, '/billing/checkout')).toEqual([{ plan: 'basic', billing: 'monthly' }]);
});

test('Basic subscribers who hit a limit are offered a switch to Pro', async () => {
  const { dialog } = await openUpgradeDialog({ ...basicUser(), plan: { ...basicUser().plan,
    limits: { max_documents: 25, max_questions_per_day: 50, max_conversions_per_day: null },
    usage: { questions_today: 50, conversions_today: 0 } } });
  expect(within(dialog).getByRole('heading')).toHaveTextContent("You're on Basic");
  expect(dialog).toHaveTextContent('Basic limits: 25 documents and 50 questions a day (50 used today).');
  expect(within(dialog).queryByRole('button', { name: /Get Basic/ })).toBeNull();
  expect(within(dialog).getByRole('button', { name: 'Switch to Pro' })).toBeInTheDocument();
});

test('the Basic badge shows its renewal date and an Upgrade button', async () => {
  mockFetch({ '/auth/me': { body: { user: basicUser() } } });
  renderAt(
    <AuthProvider>
      <TrialBadge />
    </AuthProvider>,
    '/app/documents'
  );
  expect(await screen.findByText('Basic')).toHaveAttribute('title', 'Basic · renews on March 15, 2027');
  expect(screen.getByRole('button', { name: 'Upgrade' })).toBeInTheDocument();
});

test('after paying, the app waits for Pro to switch on and says so', async () => {
  jest.useFakeTimers();
  let state = 'free';
  openSite('/app/documents?upgrade=success', {
    '/auth/me': () => ({ body: { user: state === 'pro' ? proUser() : makeUser({ state: 'free' }) } }),
  });

  expect(await screen.findByText(/Payment received. Setting up your plan/)).toBeInTheDocument();
  await waitFor(() => expect(screen.getByTestId('current-path')).toHaveTextContent(/^\/app\/documents$/));

  state = 'pro'; // Stripe's webhook has arrived
  await act(async () => { jest.advanceTimersByTime(2100); });
  expect(await screen.findByText(/You're on Pro. Thanks for upgrading!/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
  expect(screen.queryByText(/You're on Pro/)).toBeNull();
  jest.useRealTimers();
});
