import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AuthGate, AuthProvider } from '../../auth';
import { makeUser, mockFetch } from '../../../test-utils/mockFetch';
import { CurrentPath, renderAt } from '../../../test-utils/router';
import { formatPrice, monthsFree, yearlySavings } from '../pricing';

const PLAN = {
  trial_days: 7, trial_max_documents: 10, trial_max_questions_per_day: 50,
  free_max_documents: 3, free_max_questions_per_day: 10, free_conversions_per_day: 20,
  basic_price_monthly: 1.99, basic_price_yearly: 19.99, basic_max_documents: 25, basic_max_questions_per_day: 50,
  pro_price_monthly: 9, pro_price_yearly: 90, yearly_billing: true,
  guest_max_documents: 1, guest_max_questions: 5, guest_file_hours: 24, guest_conversions_per_hour: 20,
  support_email: 'help@example.com',
};

const renderPricing = ({ me = { status: 401 }, plan = PLAN } = {}) => {
  mockFetch({ '/auth/me': me, '/plans': { body: plan } });
  renderAt(
    <AuthProvider>
      <AuthGate />
      <CurrentPath />
    </AuthProvider>,
    '/pricing'
  );
};

const card = (name) => screen.getByRole('region', { name });
const path = () => screen.getByTestId('current-path').textContent;

test('shows Free, Basic and Pro with the limits and prices from the server', async () => {
  renderPricing();

  expect(await screen.findByRole('heading', { level: 1, name: 'PDF Tools That Fit Your Budget' })).toBeInTheDocument();
  expect(document.title).toBe('Pricing · Dokkiman');
  await waitFor(() => expect(card('Free')).toHaveTextContent('Up to 3 documents'));
  expect(card('Free')).toHaveTextContent('10 AI questions a day');
  expect(card('Free')).toHaveTextContent('20 file conversions a day');
  expect(card('Free')).toHaveTextContent('Starts with a 7-day trial: 10 documents and 50 questions a day.');
  expect(card('Basic')).toHaveTextContent('$1.99/ month');
  expect(card('Basic')).toHaveTextContent('Or $19.99 a year, and get 2 months free.');
  expect(card('Basic')).toHaveTextContent('Up to 25 documents');
  expect(card('Basic')).toHaveTextContent('50 AI questions a day');
  expect(card('Basic')).toHaveTextContent('Unlimited file conversions');
  expect(card('Pro')).toHaveTextContent('$9/ month');
  expect(card('Pro')).toHaveTextContent('Unlimited documents');
});

test('Basic has its own yearly price and upgrade email', async () => {
  renderPricing();
  const link = await within(await screen.findByRole('region', { name: 'Basic' }))
    .findByRole('link', { name: 'Upgrade to Basic' });
  expect(decodeURIComponent(link.getAttribute('href'))).toMatch(/subject=Upgrade to Basic \(monthly\)/);
  expect(decodeURIComponent(link.getAttribute('href'))).toContain('billed monthly ($1.99 a month)');

  fireEvent.click(screen.getByRole('button', { name: /Yearly/ }));
  expect(card('Basic')).toHaveTextContent('$19.99/ year');
  expect(card('Basic')).toHaveTextContent('Just $1.67 a month. You save $3.89.');
});

test('Basic accounts are told they are on Basic, and can still upgrade to Pro', async () => {
  renderPricing({ me: { body: { user: makeUser({ plan: 'basic', state: 'basic' }) } } });
  expect(await within(await screen.findByRole('region', { name: 'Basic' })).findByText(/on Basic/)).toBeInTheDocument();
  expect(await within(card('Pro')).findByRole('link', { name: 'Upgrade to Pro' })).toBeInTheDocument();
});

test('switching to yearly shows the yearly price and saving, and the email says which', async () => {
  renderPricing();
  // The link appears once the server's answer (with the support address) arrives
  const monthlyLink = await within(await screen.findByRole('region', { name: 'Pro' }))
    .findByRole('link', { name: 'Upgrade to Pro' });
  expect(decodeURIComponent(monthlyLink.getAttribute('href'))).toContain('billed monthly ($9 a month)');

  fireEvent.click(screen.getByRole('button', { name: /Yearly/ }));
  expect(screen.getByRole('button', { name: /Yearly/ })).toHaveAttribute('aria-pressed', 'true');
  expect(card('Pro')).toHaveTextContent('$90/ year');
  expect(card('Pro')).toHaveTextContent('Just $7.50 a month. You save $18.');
  const yearlyHref = decodeURIComponent(within(card('Pro')).getByRole('link', { name: 'Upgrade to Pro' }).getAttribute('href'));
  expect(yearlyHref).toMatch(/^mailto:help@example\.com\?subject=Upgrade to Pro \(yearly\)/);
  expect(yearlyHref).toContain('billed yearly ($90 a year)');
});

test('the FAQ explains renewal and Pro fair use with the real numbers', async () => {
  renderPricing({ plan: { ...PLAN, pro_fair_use_questions_per_day: 150 } });
  expect(await screen.findByText('Do Basic and Pro renew automatically?')).toBeInTheDocument();
  expect(screen.getByText(/When that period ends, your account moves to the Free plan unless you renew/))
    .toBeInTheDocument();
  expect(await screen.findByText(/up to 150 a day/)).toBeInTheDocument();
});

test('without a support address, upgrading is shown as coming soon', async () => {
  renderPricing({ plan: { ...PLAN, support_email: '' } });
  await screen.findByRole('heading', { level: 1, name: 'PDF Tools That Fit Your Budget' });
  expect(within(card('Pro')).getByRole('button', { name: 'Upgrades open soon' })).toBeDisabled();
  expect(within(card('Pro')).queryByRole('link', { name: 'Upgrade to Pro' })).toBeNull();
});

test('visitors can start the trial or try a tool', async () => {
  renderPricing();
  fireEvent.click(await within(await screen.findByRole('region', { name: 'Free' })).findByRole('button', { name: 'Start free trial' }));
  expect(path()).toBe('/signup');
});

test('signed-in users get their account email in the upgrade email', async () => {
  renderPricing({ me: { body: { user: makeUser() } } });
  await waitFor(() => expect(within(card('Free')).getByRole('button', { name: 'Open the app' })).toBeInTheDocument());
  const link = await within(card('Pro')).findByRole('link', { name: 'Upgrade to Pro' });
  const href = decodeURIComponent(link.getAttribute('href'));
  expect(href).toContain('Account email: me@example.com');
});

test('Pro accounts are told they are on Pro', async () => {
  renderPricing({ me: { body: { user: makeUser({ plan: 'pro', state: 'pro' }) } } });
  expect(await within(await screen.findByRole('region', { name: 'Pro' })).findByText(/on Pro/)).toBeInTheDocument();
});

test('the homepage links to the pricing page', async () => {
  mockFetch({ '/auth/me': { status: 401 }, '/plans': { body: PLAN } });
  renderAt(
    <AuthProvider>
      <AuthGate />
      <CurrentPath />
    </AuthProvider>,
    '/'
  );
  fireEvent.click(within(await screen.findByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Pricing' }));
  expect(await screen.findByRole('heading', { level: 1, name: 'PDF Tools That Fit Your Budget' })).toBeInTheDocument();
  expect(path()).toBe('/pricing');
});

test('monthly only: no Monthly / Yearly switch and no yearly prices', async () => {
  renderPricing({ plan: { ...PLAN, yearly_billing: false } });
  await waitFor(() => expect(card('Basic')).toHaveTextContent('$1.99/ month'));
  expect(screen.queryByRole('group', { name: 'Billing period' })).toBeNull();
  expect(card('Basic')).toHaveTextContent('Billed monthly. Cancel anytime.');
  expect(card('Pro')).not.toHaveTextContent('a year');
  expect(await screen.findByText(/You pay for a month at a time/)).toBeInTheDocument();
});

test('price helpers', () => {
  expect(formatPrice(9)).toBe('$9');
  expect(formatPrice(7.5)).toBe('$7.50');
  expect(formatPrice(1.99)).toBe('$1.99');
  expect(yearlySavings(9, 90)).toEqual({ perMonth: 7.5, saved: 18 });
  expect(monthsFree(9, 90)).toBe(2);
  expect(monthsFree(1.99, 19.99)).toBe(2);
  expect(monthsFree(9.99, 90)).toBe(3);
  expect(monthsFree(5, 60)).toBe(0);
});

test('signed-in users aren’t offered the free trial', async () => {
  renderPricing({ me: { body: { user: makeUser() } } });
  await waitFor(() => expect(within(card('Free')).getByRole('button', { name: 'Open the app' })).toBeInTheDocument());
  expect(screen.getByText(/Keep using the Free plan for as long as you like/)).toBeInTheDocument();
  expect(screen.queryByText(/day free trial with full access/)).not.toBeInTheDocument();
  expect(within(card('Free')).queryByText(/Starts with a/)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Start free trial' })).not.toBeInTheDocument();
});
