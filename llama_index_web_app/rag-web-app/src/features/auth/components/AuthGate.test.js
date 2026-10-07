import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AuthProvider, useAuth } from '../context/AuthContext';
import AuthGate from './AuthGate';
import { apiFetch } from '../../../shared/services/apiClient';
import { makeUser, mockFetch } from '../../../test-utils/mockFetch';
import { BackButton, CurrentPath, renderAt } from '../../../test-utils/router';

const LogoutButton = () => {
  const { logout } = useAuth();
  return <button onClick={logout}>Log out</button>;
};

const renderSite = (route) =>
  renderAt(
    <AuthProvider>
      <AuthGate>
        <p>The app</p>
        <LogoutButton />
      </AuthGate>
      <CurrentPath />
      <BackButton />
    </AuthProvider>,
    route
  );

const path = () => screen.getByTestId('current-path').textContent;

test('the homepage is at /', async () => {
  mockFetch({ '/auth/me': { status: 401 } });
  renderSite('/');
  expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Do more with your PDFs');
  expect(screen.queryByText('The app')).toBeNull();
});

test('sign-in pages have their own addresses, and the tabs keep the address in step', async () => {
  mockFetch({ '/auth/me': { status: 401 } });
  renderSite('/');

  fireEvent.click(within(await screen.findByRole('banner')).getByRole('button', { name: 'Start free trial' }));
  expect(screen.getByRole('heading', { name: 'Start your free trial' })).toBeInTheDocument();
  expect(path()).toBe('/signup');

  fireEvent.click(await screen.findByRole('tab', { name: 'Sign in' }));
  expect(path()).toBe('/login');

  fireEvent.click(screen.getByRole('button', { name: /Back to home/ }));
  expect(path()).toBe('/');
});

test('the browser Back button returns from a tool to the homepage', async () => {
  mockFetch({ '/auth/me': { status: 401 } });
  renderSite('/');

  const tools = await screen.findByRole('region', { name: 'Our tools' });
  fireEvent.click(within(tools).getByRole('button', { name: /Split PDF/ }));
  expect(path()).toBe('/app/split-pdf');
  expect(screen.getByText('The app')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Browser back' }));
  expect(path()).toBe('/');
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Do more with your PDFs');
});

test('direct links to a tool work, for guests too', async () => {
  mockFetch({ '/auth/me': { status: 401 } });
  renderSite('/app/chat');
  expect(await screen.findByText('The app')).toBeInTheDocument();
  expect(path()).toBe('/app/chat');
});

test('signed-in users are sent from /login to their documents; logging out goes home', async () => {
  mockFetch({ '/auth/me': { body: { user: makeUser() } }, '/auth/logout': { body: { success: true } } });
  renderSite('/login');

  expect(await screen.findByText('The app')).toBeInTheDocument();
  expect(path()).toBe('/app/documents');

  fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
  await waitFor(() => expect(path()).toBe('/'));
  expect(screen.queryByText('The app')).toBeNull();
});

test('signed-in users can still visit the homepage', async () => {
  mockFetch({ '/auth/me': { body: { user: makeUser() } } });
  renderSite('/');
  const nav = await screen.findByRole('banner');
  fireEvent.click(within(nav).getByRole('button', { name: 'Open the app' }));
  expect(path()).toBe('/app/documents');
});

test('an expired session sends a signed-in user to the sign-in page', async () => {
  mockFetch({ '/auth/me': { body: { user: makeUser() } }, '/getDocuments': { status: 401 } });
  renderSite('/app/documents');
  expect(await screen.findByText('The app')).toBeInTheDocument();

  await act(async () => {
    await apiFetch('/getDocuments');
  });
  expect(path()).toBe('/login');
  expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
});

test('unknown addresses go to the homepage', async () => {
  mockFetch({ '/auth/me': { status: 401 } });
  renderSite('/no/such/page');
  await waitFor(() => expect(path()).toBe('/'));
});

test('the session is checked once on load, not on every page change', async () => {
  const fetchMock = mockFetch({ '/auth/me': { status: 401 } });
  renderSite('/');
  const tools = await screen.findByRole('region', { name: 'Our tools' });

  fireEvent.click(within(tools).getByRole('button', { name: /Split PDF/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Browser back' }));
  fireEvent.click(within(await screen.findByRole('banner')).getByRole('button', { name: 'Log in' }));

  const sessionChecks = fetchMock.mock.calls.filter(([url]) => url.endsWith('/auth/me'));
  expect(sessionChecks).toHaveLength(1);
});
