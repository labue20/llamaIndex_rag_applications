import { act, fireEvent, screen } from '@testing-library/react';
import { AuthProvider } from '../context/AuthContext';
import AuthGate from './AuthGate';
import TrialBadge from './TrialBadge';
import { apiFetch } from '../../../shared/services/apiClient';
import { makeUser, mockFetch } from '../../../test-utils/mockFetch';
import { renderAt } from '../../../test-utils/router';

const renderWithUser = (getUser) => {
  mockFetch({
    '/auth/me': () => ({ body: { user: getUser() } }),
    '/uploadFile': { status: 402, body: { code: 'document_limit', error: 'The Free plan allows up to 3 documents.' } },
  });
  return renderAt(
    <AuthProvider>
      <AuthGate>
        <TrialBadge />
      </AuthGate>
    </AuthProvider>,
    '/app/documents'
  );
};

test('trial badge shows days left and opens the upgrade dialog', async () => {
  renderWithUser(() => makeUser());

  const badge = await screen.findByText('Free trial · 5 days left');
  expect(badge).toHaveAttribute('title', '3 of 50 questions used today');

  fireEvent.click(screen.getByRole('button', { name: 'Upgrade' }));
  const dialog = screen.getByRole('dialog');
  expect(dialog).toHaveTextContent('Upgrade to Pro');
  expect(dialog).toHaveTextContent('Trial limits: 10 documents and 50 questions a day (3 used today).');
  expect(dialog).toHaveTextContent('contact the site administrator');

  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('singular day wording', async () => {
  renderWithUser(() => makeUser({ trial_days_left: 1 }));
  expect(await screen.findByText('Free trial · 1 day left')).toBeInTheDocument();
});

test('a plan limit (402) refreshes the plan and opens the dialog', async () => {
  let user = makeUser();
  renderWithUser(() => user);
  await screen.findByText('Free trial · 5 days left');

  // The trial ended and the Free plan's document limit was reached
  user = makeUser({
    state: 'free',
    trial_days_left: 0,
    support_email: 'help@example.com',
    limits: { max_documents: 3, max_questions_per_day: 10, max_conversions_per_day: 20 },
    usage: { questions_today: 4, conversions_today: 0 },
  });
  await act(async () => {
    await apiFetch('/uploadFile', { method: 'POST' });
  });

  expect(await screen.findByText('Free plan')).toBeInTheDocument();
  const dialog = screen.getByRole('dialog');
  expect(dialog).toHaveTextContent("You're on the Free plan");
  expect(dialog).toHaveTextContent(
    'Free plan limits: 3 documents and 10 questions a day (4 used today), 20 file conversions a day.'
  );
  expect(dialog).toHaveTextContent('Pro is $9 a month, or $90 a year.');
  const contact = screen.getByRole('link', { name: 'Contact us to upgrade' });
  expect(contact.getAttribute('href')).toMatch(/^mailto:help@example\.com\?/);
  expect(decodeURIComponent(contact.getAttribute('href'))).toContain('Account email: me@example.com');
});

test('limits of 1 read naturally', async () => {
  renderWithUser(() => makeUser({
    state: 'free',
    limits: { max_documents: 1, max_questions_per_day: 1, max_conversions_per_day: 1 },
    usage: { questions_today: 1, conversions_today: 0 },
  }));
  fireEvent.click(await screen.findByRole('button', { name: 'Upgrade' }));
  expect(screen.getByRole('dialog')).toHaveTextContent(
    'Free plan limits: 1 document and 1 question a day (1 used today), 1 file conversion a day.'
  );
});

test('the dialog links to the pricing page', async () => {
  renderWithUser(() => makeUser());
  fireEvent.click(await screen.findByRole('button', { name: 'Upgrade' }));
  fireEvent.click(screen.getByRole('link', { name: 'Compare plans' }));
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('clicking outside closes the dialog', async () => {
  renderWithUser(() => makeUser());
  fireEvent.click(await screen.findByRole('button', { name: 'Upgrade' }));
  fireEvent.click(screen.getByTestId('upgrade-overlay'));
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('the Pro badge shows when the paid period ends', async () => {
  renderWithUser(() => makeUser({ plan: 'pro', state: 'pro', pro_until: '2027-03-15T12:00:00+00:00' }));
  expect(await screen.findByText('Pro')).toHaveAttribute('title', 'Pro until March 15, 2027');
});

test('pro accounts show a Pro badge and no upgrade button', async () => {
  renderWithUser(() => makeUser({ plan: 'pro', state: 'pro' }));
  expect(await screen.findByText('Pro')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Upgrade' })).toBeNull();
});
