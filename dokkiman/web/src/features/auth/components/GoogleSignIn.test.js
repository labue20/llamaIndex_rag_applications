import { fireEvent, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../context/AuthContext';
import AuthGate from './AuthGate';
import AuthPage from './AuthPage';
import AccountMenu from './AccountMenu';
import { makeUser, mockFetch } from '../../../test-utils/mockFetch';
import { CurrentPath, renderAt } from '../../../test-utils/router';

const GOOGLE_ONLY = { '/auth/config': { body: { google_client_id: 'client-123', password_login: false } } };

// Stand-in for Google's script: renderButton draws a plain button that "picks"
// an account and hands back a credential, like the real popup does.
let googleOptions;
let buttonOptions;
const installFakeGoogle = () => {
  window.google = {
    accounts: {
      id: {
        initialize: (options) => { googleOptions = options; },
        renderButton: (container, options) => {
          buttonOptions = options;
          const button = document.createElement('button');
          button.textContent = options.text === 'signup_with' ? 'Sign up with Google' : 'Sign in with Google';
          button.onclick = () => googleOptions.callback({ credential: 'google-id-token' });
          container.replaceChildren(button);
        },
      },
    },
  };
};

beforeEach(installFakeGoogle);
afterEach(() => {
  delete window.google;
});

const posted = (fetchMock, path) =>
  fetchMock.mock.calls.filter(([url]) => url.endsWith(path)).map(([, options]) => JSON.parse(options.body));

const renderPage = (props = {}) =>
  renderAt(
    <AuthProvider>
      <AuthPage {...props} />
      <CurrentPath />
    </AuthProvider>,
    '/login'
  );

test('signs in with Google and there is no password form', async () => {
  const fetchMock = mockFetch({
    ...GOOGLE_ONLY,
    '/auth/me': { status: 401 },
    '/auth/google': { body: { user: makeUser({}, { has_password: false }), created: false } },
  });
  renderPage();

  fireEvent.click(await screen.findByRole('button', { name: 'Sign in with Google' }));

  await waitFor(() => expect(screen.getByTestId('current-path')).toHaveTextContent('/app/documents'));
  expect(posted(fetchMock, '/auth/google')).toEqual([{ credential: 'google-id-token' }]);
  expect(googleOptions.client_id).toBe('client-123');
  expect(screen.queryByLabelText('Email')).toBeNull();
  expect(screen.queryByRole('tab')).toBeNull();
});

test('the free trial page shows "Sign up with Google"', async () => {
  mockFetch({ ...GOOGLE_ONLY, '/auth/me': { status: 401 } });
  renderPage({ initialMode: 'signup' });

  expect(await screen.findByRole('button', { name: 'Sign up with Google' })).toBeInTheDocument();
  expect(buttonOptions.text).toBe('signup_with');
  expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(await screen.findByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument();
});

test('shows the server error and lets the user try again', async () => {
  mockFetch({
    ...GOOGLE_ONLY,
    '/auth/me': { status: 401 },
    '/auth/google': { status: 429, body: { error: 'Too many accounts were created from your network today.' } },
  });
  renderPage({ initialMode: 'signup' });

  fireEvent.click(await screen.findByRole('button', { name: 'Sign up with Google' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Too many accounts');
  expect(screen.getByRole('button', { name: 'Sign up with Google' })).toBeInTheDocument();
  expect(screen.getByTestId('current-path')).toHaveTextContent('/login');
});

test('signing up with Google from a tool returns to that tool', async () => {
  mockFetch({
    ...GOOGLE_ONLY,
    '/auth/me': { status: 401 },
    '/auth/google': { status: 201, body: { user: makeUser({}, { has_password: false }), created: true } },
  });
  const StartTrial = () => {
    const { showAuth } = useAuth();
    return <button onClick={() => showAuth('signup')}>Start trial</button>;
  };
  renderAt(
    <AuthProvider>
      <AuthGate>
        <StartTrial />
      </AuthGate>
      <CurrentPath />
    </AuthProvider>,
    '/app/split-pdf'
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Start trial' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Sign up with Google' }));
  await waitFor(() => expect(screen.getByTestId('current-path')).toHaveTextContent('/app/split-pdf'));
});

test('says so when no sign-in method is set up', async () => {
  mockFetch({ '/auth/config': { body: { google_client_id: '', password_login: false } }, '/auth/me': { status: 401 } });
  renderPage();
  expect(await screen.findByRole('alert')).toHaveTextContent('Sign-in isn’t available right now');
});

test('explains when Google’s script is blocked', async () => {
  delete window.google;
  mockFetch({ ...GOOGLE_ONLY, '/auth/me': { status: 401 } });
  renderPage();

  // The page adds Google's script; simulate it failing to load (e.g. a blocker).
  // Script tags aren't reachable through Testing Library queries.
  // eslint-disable-next-line testing-library/no-node-access
  const googleScript = () => document.head.querySelector('script[src*="accounts.google.com"]');
  await waitFor(() => expect(googleScript()).not.toBeNull());
  const script = googleScript();
  fireEvent.error(script);

  expect(await screen.findByRole('alert')).toHaveTextContent("Google sign-in couldn't load");
  script.remove();
});

test('Google accounts have no Change password in the account menu', async () => {
  mockFetch({ '/auth/me': { body: { user: makeUser({}, { has_password: false }) } } });
  renderAt(
    <AuthProvider>
      <AccountMenu />
    </AuthProvider>,
    '/app/documents'
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Account: me@example.com' }));
  expect(screen.getByRole('menuitem', { name: 'Log out' })).toBeInTheDocument();
  expect(screen.queryByRole('menuitem', { name: 'Change password' })).toBeNull();
});
