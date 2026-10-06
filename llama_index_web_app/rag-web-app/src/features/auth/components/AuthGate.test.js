import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AuthProvider, useAuth } from '../context/AuthContext';
import AuthGate from './AuthGate';
import { apiFetch } from '../../../shared/services/apiClient';
import { makeUser, mockFetch } from '../../../test-utils/mockFetch';

const LogoutButton = () => {
  const { logout } = useAuth();
  return <button onClick={logout}>Log out</button>;
};

const renderGate = () =>
  render(
    <AuthProvider>
      <AuthGate>
        <p>The app</p>
        <LogoutButton />
      </AuthGate>
    </AuthProvider>
  );

test('visitors see the homepage, not the app', async () => {
  mockFetch({ '/auth/me': { status: 401 } });
  renderGate();

  expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Do more with your PDFs');
  expect(screen.queryByText('The app')).toBeNull();
});

test('homepage buttons open the right tab, and back returns home', async () => {
  mockFetch({ '/auth/me': { status: 401 } });
  renderGate();
  const nav = await screen.findByRole('banner');

  fireEvent.click(within(nav).getByRole('button', { name: 'Start free trial' }));
  expect(screen.getByRole('heading', { name: 'Start your free trial' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /Back to home/ }));
  fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Log in' }));
  expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
});

test('a logged-in user sees the app; logging out returns to the homepage', async () => {
  mockFetch({ '/auth/me': { body: { user: makeUser() } }, '/auth/logout': { body: { success: true } } });
  renderGate();

  expect(await screen.findByText('The app')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
  await waitFor(() => expect(screen.queryByText('The app')).toBeNull());
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Do more with your PDFs');
});

test('an expired session (401 from any request) returns to the homepage', async () => {
  mockFetch({ '/auth/me': { body: { user: makeUser() } }, '/getDocuments': { status: 401 } });
  renderGate();
  expect(await screen.findByText('The app')).toBeInTheDocument();

  await act(async () => {
    await apiFetch('/getDocuments');
  });
  expect(screen.queryByText('The app')).toBeNull();
});
