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
    '/uploadFile': { status: 402, body: { code: 'trial_expired', error: 'Your free trial has ended.' } },
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

test('a 402 response refreshes the plan and opens the dialog', async () => {
  let user = makeUser();
  renderWithUser(() => user);
  await screen.findByText('Free trial · 5 days left');

  user = makeUser({ state: 'expired', trial_days_left: 0, support_email: 'help@example.com' });
  await act(async () => {
    await apiFetch('/uploadFile', { method: 'POST' });
  });

  expect(await screen.findByText('Free trial ended')).toBeInTheDocument();
  expect(screen.getByRole('dialog')).toHaveTextContent('Your free trial has ended');
  const contact = screen.getByRole('link', { name: 'Contact us to upgrade' });
  expect(contact.getAttribute('href')).toMatch(/^mailto:help@example\.com\?/);
  expect(decodeURIComponent(contact.getAttribute('href'))).toContain('me@example.com');
});

test('clicking outside closes the dialog', async () => {
  renderWithUser(() => makeUser());
  fireEvent.click(await screen.findByRole('button', { name: 'Upgrade' }));
  fireEvent.click(screen.getByTestId('upgrade-overlay'));
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('pro accounts show a Pro badge and no upgrade button', async () => {
  renderWithUser(() => makeUser({ plan: 'pro', state: 'pro' }));
  expect(await screen.findByText('Pro')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Upgrade' })).toBeNull();
});
