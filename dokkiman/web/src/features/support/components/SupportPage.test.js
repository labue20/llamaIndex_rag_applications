import { fireEvent, screen } from '@testing-library/react';
import { AuthProvider } from '../../auth/context/AuthContext';
import SupportPage from './SupportPage';
import { makeUser, mockFetch } from '../../../test-utils/mockFetch';
import { renderAt } from '../../../test-utils/router';

const show = () => renderAt(<AuthProvider><SupportPage /></AuthProvider>, '/support');

test('quick answers and a form to send us a message', async () => {
  const fetchMock = mockFetch({ '/auth/me': { status: 401 }, '/support': { body: { sent: true } } });
  show();
  expect(screen.getByRole('heading', { level: 1, name: 'How can we help?' })).toBeInTheDocument();
  expect(screen.getByText('I forgot my password')).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'jordan@example.com' } });
  fireEvent.change(screen.getByLabelText('Topic'), { target: { value: 'feature' } });
  fireEvent.change(screen.getByLabelText('How can we help?'), { target: { value: 'Could you add a dark mode?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

  expect(await screen.findByRole('status')).toHaveTextContent("We'll reply to jordan@example.com");
  const call = fetchMock.mock.calls.find(([url]) => url.endsWith('/support'));
  expect(JSON.parse(call[1].body)).toMatchObject({
    email: 'jordan@example.com', topic: 'feature', message: 'Could you add a dark mode?', website: '',
  });
});

test('a signed-in user’s email is filled in', async () => {
  mockFetch({ '/auth/me': { body: { user: makeUser() } } });
  show();
  expect(await screen.findByDisplayValue('me@example.com')).toBeInTheDocument();
});

test('a too-short message is caught before sending, and server errors are shown', async () => {
  const fetchMock = mockFetch({
    '/auth/me': { status: 401 },
    '/support': { status: 429, body: { error: 'You’ve sent several messages in the last hour.' } },
  });
  show();
  fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'jordan@example.com' } });
  fireEvent.change(screen.getByLabelText('How can we help?'), { target: { value: 'help' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Tell us a little more');
  expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/support'))).toBe(false);

  fireEvent.change(screen.getByLabelText('How can we help?'), { target: { value: 'The merge button does nothing' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('several messages in the last hour');
});
