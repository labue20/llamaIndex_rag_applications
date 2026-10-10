import { fireEvent, screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { ResetPasswordPage, VerifyEmailPage } from './EmailLinkPages';
import { makeUser, mockFetch } from '../../../test-utils/mockFetch';
import { CurrentPath, renderAt } from '../../../test-utils/router';

const LoggedInAs = () => {
  const { user } = useAuth();
  return user ? <p>Logged in as {user.email}</p> : null;
};

const open = (route) => renderAt(
  <AuthProvider>
    <Routes>
      <Route path='/verify-email' element={<VerifyEmailPage />} />
      <Route path='/reset-password' element={<ResetPasswordPage />} />
      <Route path='*' element={<p>Elsewhere</p>} />
    </Routes>
    <LoggedInAs />
    <CurrentPath />
  </AuthProvider>,
  route
);

const body = (fetchMock, path) => JSON.parse(fetchMock.mock.calls.find(([url]) => url.endsWith(path))[1].body);

test('the confirmation link signs you in, once', async () => {
  const fetchMock = mockFetch({
    '/auth/me': { status: 401 },
    '/auth/verify-email': { status: 201, body: { user: makeUser() } },
  });
  open('/verify-email?token=abc');
  expect(await screen.findByText('Logged in as me@example.com')).toBeInTheDocument();
  expect(body(fetchMock, '/auth/verify-email')).toEqual({ token: 'abc' });
  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/auth/verify-email'))).toHaveLength(1);
});

test('in another browser, the password chosen is asked for', async () => {
  const fetchMock = mockFetch({
    '/auth/me': { status: 401 },
    '/auth/verify-email': (_url, options) => (JSON.parse(options.body).password
      ? { status: 201, body: { user: makeUser() } }
      : { status: 400, body: { error: 'Enter the password you chose.', code: 'password_needed' } }),
  });
  open('/verify-email?token=abc');
  fireEvent.change(await screen.findByLabelText('Password'), { target: { value: 'password-123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and sign in' }));
  expect(await screen.findByText('Logged in as me@example.com')).toBeInTheDocument();
  const calls = fetchMock.mock.calls.filter(([url]) => url.endsWith('/auth/verify-email'));
  expect(JSON.parse(calls[1][1].body)).toEqual({ token: 'abc', password: 'password-123' });
});

test('an old confirmation link says what to do', async () => {
  mockFetch({
    '/auth/me': { status: 401 },
    '/auth/verify-email': { status: 400, body: { error: 'This link has expired or was already used.', code: 'link_invalid' } },
  });
  open('/verify-email?token=old');
  expect(await screen.findByRole('alert')).toHaveTextContent('This link has expired or was already used.');
  expect(screen.getByRole('link', { name: 'Sign up again' })).toHaveAttribute('href', '/signup');
});

test('a reset link sets a new password and signs you in', async () => {
  const fetchMock = mockFetch({
    '/auth/me': { status: 401 },
    '/auth/reset-password': { body: { user: makeUser() } },
  });
  open('/reset-password?token=xyz');
  fireEvent.change(await screen.findByLabelText('New password'), { target: { value: 'short' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save new password' }));
  expect(screen.getByRole('alert')).toHaveTextContent(/at least 8 characters/i);

  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'brand-new-pass-9' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save new password' }));
  expect(await screen.findByText('Logged in as me@example.com')).toBeInTheDocument();
  expect(body(fetchMock, '/auth/reset-password')).toEqual({ token: 'xyz', password: 'brand-new-pass-9' });
});
