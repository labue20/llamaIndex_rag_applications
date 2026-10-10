import { fireEvent, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../context/AuthContext';
import AuthPage from './AuthPage';
import { makeUser, mockFetch } from '../../../test-utils/mockFetch';
import { renderAt } from '../../../test-utils/router';

const LoggedInAs = () => {
  const { user } = useAuth();
  return user ? <p>Logged in as {user.email}</p> : null;
};

// Renders the page and waits for the email form (shown once /auth/config answers)
const renderAuthPage = async (props = {}) => {
  renderAt(
    <AuthProvider>
      <AuthPage {...props} />
      <LoggedInAs />
    </AuthProvider>,
    '/login'
  );
  await screen.findByLabelText('Email');
};

const fillIn = (email, password) => {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
};

test('signs in with email and password', async () => {
  const fetchMock = mockFetch({
    '/auth/me': { status: 401 },
    '/auth/login': { body: { user: makeUser() } },
  });
  await renderAuthPage();

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
  await renderAuthPage();

  fillIn('me@example.com', 'wrong-password');
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.');
  expect(screen.queryByText(/Logged in as/)).toBeNull();
});

test('sign-up checks the password length before calling the server', async () => {
  const fetchMock = mockFetch({ '/auth/me': { status: 401 } });
  await renderAuthPage({ initialMode: 'signup' });

  expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
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
  await renderAuthPage({ initialMode: 'signup' });

  fillIn('me@example.com', 'password-123');
  fireEvent.click(screen.getByRole('button', { name: 'Start free trial' }));

  expect(await screen.findByText('Logged in as me@example.com')).toBeInTheDocument();
});

test('sign-up with an email asks to confirm it before the account exists', async () => {
  const fetchMock = mockFetch({
    '/auth/me': { status: 401 },
    '/auth/signup': { status: 202, body: { verification_sent: true, email: 'me@example.com' } },
  });
  await renderAuthPage({ initialMode: 'signup' });

  fillIn('me@example.com', 'password-123');
  fireEvent.click(screen.getByRole('button', { name: 'Start free trial' }));

  expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
  expect(screen.getByText('me@example.com')).toBeInTheDocument();
  expect(screen.queryByText(/Logged in as/)).not.toBeInTheDocument();

  // Send it again: the same sign-up is posted again
  fireEvent.click(screen.getByRole('button', { name: 'Send it again' }));
  expect(await screen.findByText('Sent again. It can take a minute to arrive.')).toBeInTheDocument();
  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/auth/signup'))).toHaveLength(2);

  fireEvent.click(screen.getByRole('button', { name: 'Use a different email' }));
  expect(screen.getByLabelText('Email')).toBeInTheDocument();
});

test('explains when the server is unreachable', async () => {
  global.fetch = jest.fn(() => Promise.reject(new TypeError('Failed to fetch')));
  renderAt(
    <AuthProvider>
      <AuthPage />
    </AuthProvider>,
    '/login'
  );
  expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach the server");
});

test('explains when the connection drops while signing in', async () => {
  const fetchMock = mockFetch({ '/auth/me': { status: 401 } });
  const answer = fetchMock.getMockImplementation();
  fetchMock.mockImplementation((url, options) =>
    url.endsWith('/auth/login') ? Promise.reject(new TypeError('Failed to fetch')) : answer(url, options)
  );
  await renderAuthPage();

  fillIn('me@example.com', 'password-123');
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

  expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach the server");
});

test('switches between sign in and sign up, and toggles password visibility', async () => {
  mockFetch({ '/auth/me': { status: 401 } });
  const onBack = jest.fn();
  await renderAuthPage({ onBack });

  fireEvent.click(screen.getByRole('button', { name: 'Create one' }));
  expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(screen.getByRole('heading', { name: 'Sign in to Dokkiman' })).toBeInTheDocument();

  const password = screen.getByLabelText('Password');
  expect(password).toHaveAttribute('type', 'password');
  fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
  expect(password).toHaveAttribute('type', 'text');

  fireEvent.click(screen.getByRole('button', { name: /Back to home/ }));
  expect(onBack).toHaveBeenCalled();
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
});

test('with Google available, the email form opens from a button', async () => {
  mockFetch({
    '/auth/me': { status: 401 },
    '/auth/config': { body: { google_client_id: 'client-id', password_login: true } },
  });
  renderAt(<AuthProvider><AuthPage initialMode='signup' /></AuthProvider>, '/signup');
  fireEvent.click(await screen.findByRole('button', { name: 'Sign up with Email' }));
  expect(screen.getByLabelText('Email')).toBeInTheDocument();
  expect(screen.getByLabelText('Password')).toBeInTheDocument();
});
