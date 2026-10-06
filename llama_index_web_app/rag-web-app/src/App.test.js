import { render, screen, within } from '@testing-library/react';
import App from './App';
import { AuthGate, AuthProvider } from './features/auth';
import { makeUser, mockFetch } from './test-utils/mockFetch';

test('logged-in users get the full app with their account in the header', async () => {
  mockFetch({
    '/auth/me': { body: { user: makeUser() } },
    '/getDocuments': { body: [{ id: 'doc-1', filename: 'transcript.pdf', text: '' }] },
  });

  render(
    <AuthProvider>
      <AuthGate>
        <App />
      </AuthGate>
    </AuthProvider>
  );

  const header = await screen.findByRole('banner');
  expect(within(header).getByText('RAG Web Application')).toBeInTheDocument();
  expect(within(header).getByText('me@example.com')).toBeInTheDocument();
  expect(within(header).getByText('Free trial · 5 days left')).toBeInTheDocument();
  expect(within(header).getByRole('button', { name: 'Log out' })).toBeInTheDocument();

  for (const section of ['Document Manager', 'AI PDF', 'PDF to Word', 'Word to PDF', 'Split PDF']) {
    expect(screen.getAllByText(section).length).toBeGreaterThan(0);
  }
});
