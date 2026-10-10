import { act, fireEvent, screen, within } from '@testing-library/react';
import App from '../../../App';
import { AuthGate, AuthProvider } from '..';
import { apiFetch } from '../../../shared/services/apiClient';
import { mockFetch } from '../../../test-utils/mockFetch';
import { renderAt } from '../../../test-utils/router';

const renderSite = () =>
  renderAt(
    <AuthProvider>
      <AuthGate>
        <App />
      </AuthGate>
    </AuthProvider>,
    '/'
  );

beforeEach(() => {
  mockFetch({
    '/auth/me': { status: 401 },
    '/plans': { body: { trial_days: 7, trial_max_documents: 10, trial_max_questions_per_day: 50, guest_max_documents: 1, guest_max_questions: 5 } },
    '/uploadFile': { status: 402, body: { code: 'guest_limit', error: 'Guests can chat with 1 document.' } },
  });
});

test('visitors can open a tool from the homepage without an account', async () => {
  renderSite();
  fireEvent.click(await screen.findByRole('button', { name: 'Try it now, no sign-up' }));

  // The app opens on Chat with PDF, in guest mode
  expect(await screen.findByRole('heading', { name: 'Chat with PDF' })).toBeInTheDocument();
  expect(await screen.findByText(/Trying it as a guest: 1 document and 5 questions/)).toBeInTheDocument();
  const header = screen.getAllByRole('banner')[0];
  expect(within(header).getByRole('button', { name: 'Log in' })).toBeInTheDocument();
  expect(within(header).getByRole('button', { name: 'Sign up free' })).toBeInTheDocument();
  // Guests have no Document Manager to pick from
  expect(screen.queryByRole('button', { name: 'Upload from Document Manager' })).toBeNull();
});

test('the Document Manager invites guests to create an account', async () => {
  renderSite();
  fireEvent.click(await screen.findByRole('button', { name: 'Try it now, no sign-up' }));
  fireEvent.click(screen.getAllByRole('button', { name: 'Document Manager' })[0]);

  expect(screen.getByRole('heading', { name: 'Keep your documents in one place' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Upload files/ })).toBeNull();

  fireEvent.click(screen.getAllByRole('button', { name: 'Create free account' })[0]);
  expect(await screen.findByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
});

test('hitting a guest limit offers a free account', async () => {
  renderSite();
  fireEvent.click(await screen.findByRole('button', { name: 'Try it now, no sign-up' }));
  await screen.findByRole('heading', { name: 'Chat with PDF' });

  await act(async () => {
    await apiFetch('/uploadFile', { method: 'POST' });
  });

  const dialog = await screen.findByRole('dialog');
  expect(dialog).toHaveTextContent('Create a free account to keep going');
  expect(dialog).toHaveTextContent("the document you're working on comes with you");

  fireEvent.click(within(dialog).getByRole('button', { name: 'I already have an account' }));
  expect(await screen.findByRole('heading', { name: 'Sign in to Dokkiman' })).toBeInTheDocument();
});

test('a converter tool card opens that tool', async () => {
  renderSite();
  const tools = await screen.findByRole('region', { name: 'Our tools' });
  fireEvent.click(within(tools).getByRole('button', { name: /Split PDF/ }));
  expect(await screen.findByRole('heading', { name: 'Split PDF Converter' })).toBeInTheDocument();
});
