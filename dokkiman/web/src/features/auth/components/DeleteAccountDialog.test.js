import { fireEvent, screen, waitFor } from '@testing-library/react';
import { AccountMenu, AuthProvider } from '..';
import { makeUser, mockFetch } from '../../../test-utils/mockFetch';
import { CurrentPath, renderAt } from '../../../test-utils/router';

const openDialog = async (routes = {}) => {
  const fetchMock = mockFetch({ '/auth/me': { body: { user: makeUser() } }, '/auth/logout': { body: {} }, ...routes });
  renderAt(<AuthProvider><AccountMenu /><CurrentPath /></AuthProvider>, '/app/documents');
  fireEvent.click(await screen.findByRole('button', { name: 'Account: me@example.com' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete account' }));
  return fetchMock;
};

const deleteCalls = (fetchMock) =>
  fetchMock.mock.calls.filter(([url, options = {}]) => url.endsWith('/account') && options.method === 'DELETE');

test('deleting asks the person to type DELETE, then signs them out', async () => {
  const fetchMock = await openDialog({ '/account': { body: { deleted: true } } });
  const dialog = screen.getByRole('dialog', { name: 'Delete your account?' });
  expect(dialog).toHaveTextContent('me@example.com');
  const button = screen.getByRole('button', { name: 'Delete my account' });
  expect(button).toBeDisabled();

  fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: 'delete' } });
  expect(button).toBeEnabled();
  fireEvent.click(button);

  await waitFor(() => expect(screen.getByTestId('current-path')).toHaveTextContent(/^\/$/));
  expect(deleteCalls(fetchMock)).toHaveLength(1);
  expect(JSON.parse(deleteCalls(fetchMock)[0][1].body)).toEqual({ confirm: 'DELETE' });
});

test('a renewing subscription has to be cancelled first', async () => {
  await openDialog({
    '/account': { status: 409, body: { error: 'Cancel your subscription first, in Manage billing.', code: 'subscription_active' } },
  });
  fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: 'DELETE' } });
  fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Cancel your subscription first');
  expect(screen.getByRole('button', { name: 'Open Manage billing' })).toBeInTheDocument();
  expect(screen.getByTestId('current-path')).toHaveTextContent('/app/documents');
});
