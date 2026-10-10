import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AuthProvider, useAuth } from '../context/AuthContext';
import AuthGate from './AuthGate';
import AuthPage from './AuthPage';
import AccountMenu from './AccountMenu';
import { makeUser, mockFetch } from '../../../test-utils/mockFetch';
import { CurrentPath, renderAt } from '../../../test-utils/router';

const fillIn = (email, password) => {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
};

// Renders the page and waits for the email form (shown once /auth/config answers)
const renderAuthPage = async (props = {}) => {
  renderAt(
    <AuthProvider>
      <AuthPage {...props} />
    </AuthProvider>,
    '/login'
  );
  await screen.findByLabelText('Email');
};

const posted = (fetchMock, path) =>
  fetchMock.mock.calls.filter(([url]) => url.endsWith(path)).map(([, options]) => JSON.parse(options.body));

test('checks the email format before calling the server', async () => {
  const fetchMock = mockFetch({ '/auth/me': { status: 401 } });
  await renderAuthPage();

  fillIn('me@example', 'password-123');
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid email address');
  expect(posted(fetchMock, '/auth/login')).toHaveLength(0);
});

test('the sign-up checklist follows what is typed', async () => {
  const fetchMock = mockFetch({ '/auth/me': { status: 401 } });
  await renderAuthPage({ initialMode: 'signup' });

  const checks = screen.getByRole('list', { name: 'Password requirements' });
  const item = (name) => within(checks).getAllByRole('listitem').find((li) => li.textContent.startsWith(name));

  fillIn('jane@example.com', 'jane');
  expect(item('At least 8 characters')).not.toHaveClass('auth-form__check--ok');
  expect(item('Not your email address')).not.toHaveClass('auth-form__check--ok');

  fillIn('jane@example.com', 'jane@example.com');
  expect(item('At least 8 characters')).toHaveClass('auth-form__check--ok');
  fireEvent.click(screen.getByRole('button', { name: 'Start free trial' }));
  expect(await screen.findByRole('alert')).toHaveTextContent("can't be your email address");
  expect(posted(fetchMock, '/auth/signup')).toHaveLength(0);

  fillIn('jane@example.com', 'a long passphrase');
  expect(item('Not your email address')).toHaveClass('auth-form__check--ok');
});

test('an email that already has an account offers to sign in instead', async () => {
  mockFetch({
    '/auth/me': { status: 401 },
    '/auth/signup': { status: 409, body: { error: 'An account with this email already exists.', code: 'email_taken' } },
  });
  await renderAuthPage({ initialMode: 'signup' });

  fillIn('me@example.com', 'password-123');
  fireEvent.click(screen.getByRole('button', { name: 'Start free trial' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Sign in instead' }));

  expect(screen.getByRole('heading', { name: 'Sign in to Dokkiman' })).toBeInTheDocument();
  expect(screen.getByLabelText('Email')).toHaveValue('me@example.com');
  expect(screen.getByLabelText('Password')).toHaveValue('');
  expect(screen.getByLabelText('Password')).toHaveFocus();
});

test('forgot password emails a reset link to the address typed', async () => {
  const fetchMock = mockFetch({
    '/auth/me': { status: 401 },
    '/auth/forgot-password': { body: { sent: true } },
  });
  await renderAuthPage();
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'me@example.com' } });

  const toggle = screen.getByRole('button', { name: 'Forgot password?' });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(toggle);
  const form = screen.getByRole('group', { name: 'Reset your password' });
  expect(within(form).getByLabelText('Email for the reset link')).toHaveValue('me@example.com');
  fireEvent.click(within(form).getByRole('button', { name: 'Email me a link' }));

  expect(await screen.findByRole('status')).toHaveTextContent("If there's an account for me@example.com");
  const call = fetchMock.mock.calls.find(([url]) => url.endsWith('/auth/forgot-password'));
  expect(JSON.parse(call[1].body)).toEqual({ email: 'me@example.com' });
});

test('warns when Caps Lock is on', async () => {
  mockFetch({ '/auth/me': { status: 401 } });
  await renderAuthPage();

  const password = screen.getByLabelText('Password');
  fireEvent.keyDown(password, { key: 'A', getModifierState: () => true });
  // jsdom ignores getModifierState in the init dict; patch the event instead
  const event = new KeyboardEvent('keyup', { key: 'A', bubbles: true });
  event.getModifierState = (key) => key === 'CapsLock';
  fireEvent(password, event);
  expect(screen.getByText('Caps Lock is on')).toBeInTheDocument();

  fireEvent.blur(password);
  expect(screen.queryByText('Caps Lock is on')).toBeNull();
});

// --- returning to the tool after logging in ---------------------------------------

const LogInButton = () => {
  const { showAuth } = useAuth();
  return <button onClick={() => showAuth('login')}>Header log in</button>;
};

test('logging in from a tool page returns to that tool', async () => {
  mockFetch({
    '/auth/me': { status: 401 },
    '/auth/login': { body: { user: makeUser() } },
  });
  renderAt(
    <AuthProvider>
      <AuthGate>
        <LogInButton />
      </AuthGate>
      <CurrentPath />
    </AuthProvider>,
    '/app/e-sign'
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Header log in' }));
  expect(screen.getByTestId('current-path')).toHaveTextContent('/login');
  await screen.findByLabelText('Email');

  fillIn('me@example.com', 'password-123');
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  await waitFor(() => expect(screen.getByTestId('current-path')).toHaveTextContent('/app/e-sign'));
});

test('logging in from the homepage goes to the documents', async () => {
  mockFetch({
    '/auth/me': { status: 401 },
    '/auth/login': { body: { user: makeUser() } },
  });
  renderAt(
    <AuthProvider>
      <AuthGate />
      <CurrentPath />
    </AuthProvider>,
    '/'
  );

  fireEvent.click((await screen.findAllByRole('button', { name: 'Log in' }))[0]);
  await screen.findByLabelText('Email');
  fillIn('me@example.com', 'password-123');
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  await waitFor(() => expect(screen.getByTestId('current-path')).toHaveTextContent('/app/documents'));
});

// --- account menu and Change password ---------------------------------------------

const mockAccountServer = (routes) => mockFetch({ '/auth/me': { body: { user: makeUser() } }, ...routes });

const renderAccountMenu = () =>
  renderAt(
    <AuthProvider>
      <AccountMenu />
      <CurrentPath />
    </AuthProvider>,
    '/app/documents'
  );

const openMenu = async () =>
  fireEvent.click(await screen.findByRole('button', { name: 'Account: me@example.com' }));

test('the account menu opens, closes on Escape and logs out', async () => {
  mockAccountServer({ '/auth/logout': { body: { success: true } } });
  renderAccountMenu();
  await openMenu();
  expect(screen.getByRole('menu')).toHaveTextContent('Signed in as me@example.com');

  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('menu')).toBeNull();
  expect(screen.getByRole('button', { name: 'Account: me@example.com' })).toHaveFocus();

  await openMenu();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Log out' }));
  await waitFor(() => expect(screen.getByTestId('current-path')).toHaveTextContent(/^\/$/));
});

const fillPasswords = (current, next, confirm = next) => {
  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: current } });
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: next } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: confirm } });
};

test('changes the password', async () => {
  const fetchMock = mockAccountServer({ '/auth/change-password': { body: { user: makeUser() } } });
  renderAccountMenu();
  await openMenu();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Change password' }));

  const dialog = screen.getByRole('dialog', { name: 'Change password' });
  fillPasswords('old-password', 'a-new-long-phrase');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Change password' }));

  expect(await within(dialog).findByRole('status')).toHaveTextContent('signed out on your other devices');
  expect(posted(fetchMock, '/auth/change-password')).toEqual([
    { current_password: 'old-password', new_password: 'a-new-long-phrase' },
  ]);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('change password checks the new password and shows server errors', async () => {
  const fetchMock = mockAccountServer({
    '/auth/change-password': { status: 400, body: { error: 'Your current password is incorrect.' } },
  });
  renderAccountMenu();
  await openMenu();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Change password' }));
  const dialog = screen.getByRole('dialog', { name: 'Change password' });
  const submit = () => fireEvent.click(within(dialog).getByRole('button', { name: 'Change password' }));

  fillPasswords('old-password', 'short');
  submit();
  expect(within(dialog).getByRole('alert')).toHaveTextContent('at least 8 characters');

  fillPasswords('old-password', 'a-new-long-phrase', 'a-different-phrase');
  submit();
  expect(within(dialog).getByRole('alert')).toHaveTextContent("don't match");
  expect(posted(fetchMock, '/auth/change-password')).toHaveLength(0);

  fillPasswords('wrong-password', 'a-new-long-phrase');
  submit();
  await waitFor(() =>
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Your current password is incorrect.')
  );
});
