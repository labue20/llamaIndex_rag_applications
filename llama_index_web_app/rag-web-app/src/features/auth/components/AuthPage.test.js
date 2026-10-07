import { fireEvent, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../context/AuthContext';
import AuthPage from './AuthPage';
import { makeUser, mockFetch } from '../../../test-utils/mockFetch';
import { renderAt } from '../../../test-utils/router';

const LoggedInAs = () => {
  const { user } = useAuth();
  return user ? <p>Logged in as {user.email}</p> : null;
};

const renderAuthPage = (props = {}) =>
  renderAt(
    <AuthProvider>
      <AuthPage {...props} />
      <LoggedInAs />
    </AuthProvider>,
    '/login'
  );

const fillIn = (email, password) => {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
};

test('signs in with email and password', async () => {
  const fetchMock = mockFetch({
    '/auth/me': { status: 401 },
    '/auth/login': { body: { user: makeUser() } },
  });
  renderAuthPage();

  fillIn('me@example.com ', 'password-123');
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

  expect(await screen.findByText('Logged in as me@example.com')).toBeInTheDocument();
  const loginCall = fetchMock.mock.calls.find(([url]) => url.endsWith('/auth/login'));
  expect(JSON.parse(loginCall[1].body)).toEqual({ email: 'me@example.com', password: 'password-123' });
});

test('shows the server error for a wrong password', async () => {
  mockFetch({
    '/auth/me': { status: 401 },
    '/auth/login': { status: 401, body: { error: 'Incorrect email or password.' } },
  });
  renderAuthPage();

  fillIn('me@example.com', 'wrong-password');
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.');
  expect(screen.queryByText(/Logged in as/)).toBeNull();
});

test('sign-up checks the password length before calling the server', async () => {
  const fetchMock = mockFetch({ '/auth/me': { status: 401 } });
  renderAuthPage({ initialMode: 'signup' });

  expect(screen.getByRole('heading', { name: 'Start your free trial' })).toBeInTheDocument();
  fillIn('new@example.com', 'short');
  fireEvent.click(screen.getByRole('button', { name: 'Start free trial' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Password must be at least 8 characters.');
  expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/auth/signup'))).toBe(false);
});

test('sign-up creates the account', async () => {
  mockFetch({
    '/auth/me': { status: 401 },
    '/auth/signup': { status: 201, body: { user: makeUser() } },
  });
  renderAuthPage({ initialMode: 'signup' });

  fillIn('me@example.com', 'password-123');
  fireEvent.click(screen.getByRole('button', { name: 'Start free trial' }));

  expect(await screen.findByText('Logged in as me@example.com')).toBeInTheDocument();
});

test('explains when the server is unreachable', async () => {
  global.fetch = jest.fn((url) =>
    url.endsWith('/auth/me') ? Promise.resolve({ ok: false, status: 401 }) : Promise.reject(new TypeError('Failed to fetch'))
  );
  renderAuthPage();

  fillIn('me@example.com', 'password-123');
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

  expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach the server");
});

test('switches between tabs and toggles password visibility', async () => {
  mockFetch({ '/auth/me': { status: 401 } });
  const onBack = jest.fn();
  renderAuthPage({ onBack });

  fireEvent.click(screen.getByRole('tab', { name: 'Create account' }));
  expect(screen.getByRole('heading', { name: 'Start your free trial' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Sign in' }));
  expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();

  const password = screen.getByLabelText('Password');
  expect(password).toHaveAttribute('type', 'password');
  fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
  expect(password).toHaveAttribute('type', 'text');

  fireEvent.click(screen.getByRole('button', { name: /Back to home/ }));
  expect(onBack).toHaveBeenCalled();
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
});
