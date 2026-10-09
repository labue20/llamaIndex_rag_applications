import { fireEvent, screen, within } from '@testing-library/react';
import { renderAt } from './test-utils/router';
import App from './App';
import { AuthGate, AuthProvider } from './features/auth';
import { makeUser, mockFetch } from './test-utils/mockFetch';

test('logged-in users get the full app with their account in the header', async () => {
  mockFetch({
    '/auth/me': { body: { user: makeUser() } },
    '/getDocuments': { body: [{ id: 'doc-1', filename: 'transcript.pdf', text: '' }] },
  });

  renderAt(
    <AuthProvider>
      <AuthGate>
        <App />
      </AuthGate>
    </AuthProvider>,
    '/app/documents'
  );

  const header = await screen.findByRole('banner');
  expect(within(header).getByText('Dokkiman')).toBeInTheDocument();
  expect(within(header).getByText('me@example.com')).toBeInTheDocument();
  expect(within(header).getByText('Free trial · 5 days left')).toBeInTheDocument();
  fireEvent.click(within(header).getByRole('button', { name: 'Account: me@example.com' }));
  expect(within(header).getByRole('menuitem', { name: 'Log out' })).toBeInTheDocument();
  expect(within(header).getByRole('menuitem', { name: 'Change password' })).toBeInTheDocument();

  for (const section of ['Document Manager', 'AI PDF', 'PDF to Word', 'Word to PDF', 'Split PDF', 'E-Sign']) {
    expect(screen.getAllByText(section).length).toBeGreaterThan(0);
  }
});

test('a file chosen on a tool’s public page opens in that tool', async () => {
  mockFetch({ '/auth/me': { status: 401 } });
  renderAt(
    <AuthProvider>
      <AuthGate>
        <App />
      </AuthGate>
    </AuthProvider>,
    '/compress-pdf'
  );

  expect(await screen.findByRole('heading', { level: 1, name: 'Compress PDF' })).toBeInTheDocument();
  const scan = new File(['%PDF'], 'scan.pdf', { type: 'application/pdf' });
  fireEvent.change(screen.getByLabelText(/Choose a PDF to compress/), { target: { files: [scan] } });

  // The Compress PDF tool, with the file open and ready
  expect(await screen.findByText('scan.pdf')).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: /Recommended/ })).toBeChecked();
});
