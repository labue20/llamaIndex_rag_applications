import { fireEvent, screen, within } from '@testing-library/react';
import { AuthGate, AuthProvider } from '../../auth';
import { Footer } from '../../../shared';
import { mockFetch } from '../../../test-utils/mockFetch';
import { CurrentPath, renderAt } from '../../../test-utils/router';
import { LAST_UPDATED } from './LegalPage';

const PLAN = {
  trial_days: 7, trial_max_documents: 10, trial_max_questions_per_day: 50,
  guest_file_hours: 24, support_email: 'help@example.com',
};

const renderSite = (route) =>
  renderAt(
    <AuthProvider>
      <AuthGate />
      <CurrentPath />
    </AuthProvider>,
    route
  );

const path = () => screen.getByTestId('current-path').textContent;

test('the privacy policy has its own address and states what happens to documents', async () => {
  mockFetch({ '/auth/me': { status: 401 }, '/plans': { body: PLAN } });
  renderSite('/privacy');

  expect(await screen.findByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument();
  expect(screen.getByText(`Last updated: ${LAST_UPDATED}`)).toBeInTheDocument();
  expect(document.title).toBe('Privacy Policy · Dokkiman');
  expect(screen.getByRole('heading', { name: '4. Who else processes your information' })).toBeInTheDocument();
  expect(await screen.findByText(/deleted after 24 hours/)).toBeInTheDocument();
  // Every provider that handles personal data is named, and where it's processed
  expect(screen.getByText('Amazon Web Services (AWS)')).toBeInTheDocument();
  expect(screen.getByText('Resend')).toBeInTheDocument();
  expect(screen.getByText(/EU Standard Contractual Clauses/)).toBeInTheDocument();
  expect(screen.getAllByRole('link', { name: 'help@example.com' }).length).toBeGreaterThan(0);

  fireEvent.click(screen.getByRole('link', { name: 'Terms of Service' }));
  expect(path()).toBe('/terms');
});

test('the terms use the real trial terms and warn that AI answers are not advice', async () => {
  mockFetch({ '/auth/me': { status: 401 }, '/plans': { body: { ...PLAN, trial_days: 14 } } });
  renderSite('/terms');

  expect(await screen.findByRole('heading', { level: 1, name: 'Terms of Service' })).toBeInTheDocument();
  expect(await screen.findByText(/14-day free trial with up to 10 documents and 50 questions a day/))
    .toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '6. AI answers are not professional advice' })).toBeInTheDocument();
  expect(screen.getByText(/not tax, legal, accounting or financial advice/)).toBeInTheDocument();
  expect(screen.getByText(/don.t renew automatically/)).toBeInTheDocument();
  expect(screen.getByText(/up to 150 AI questions a day/)).toBeInTheDocument();

  fireEvent.click(screen.getAllByRole('link', { name: /Back to home/ })[0]);
  expect(path()).toBe('/');
});

test('the homepage footer links to both pages', async () => {
  mockFetch({ '/auth/me': { status: 401 }, '/plans': { body: PLAN } });
  renderSite('/');

  const footer = within(await screen.findByRole('contentinfo'));
  // In the Legal column and again next to the copyright line
  footer.getAllByRole('link', { name: 'Privacy Policy' }).forEach((link) => expect(link).toHaveAttribute('href', '/privacy'));
  footer.getAllByRole('link', { name: 'Terms of Service' }).forEach((link) => expect(link).toHaveAttribute('href', '/terms'));
  expect(footer.getAllByRole('link', { name: 'Privacy Policy' })).toHaveLength(2);
  expect(footer.getByText(`© ${new Date().getFullYear()} Dokkiman. All rights reserved.`))
    .toBeInTheDocument();
});

test('the sign-in page links to the terms and privacy policy next to Google sign-in', async () => {
  window.google = { accounts: { id: { initialize: () => {}, renderButton: () => {} } } };
  mockFetch({
    '/auth/me': { status: 401 },
    '/auth/config': { body: { google_client_id: 'client-123', password_login: false } },
  });
  renderSite('/signup');

  expect(await screen.findByText(/By signing up, you accept the/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms');
  expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy');
  delete window.google;
});

test('the app footer links to the legal pages and the Support page', () => {
  renderAt(<Footer />, '/app/documents');

  expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy');
  expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms');
  expect(screen.getByRole('link', { name: 'Contact Us' })).toHaveAttribute('href', '/support');
});
