import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AuthProvider } from '../../auth';
import { makeUser } from '../../../test-utils/mockFetch';
import { renderAt } from '../../../test-utils/router';
import ESign from './ESign';
import { sendForSignature } from '../handoff';
import { mockServer, pdfFile } from './testHelpers';

const USER = makeUser({ signature_requests: { limit: 3, used: 1 } });

const REQUEST = {
  id: 'r1', title: 'Lease', message: '', file_name: 'lease.pdf', page_count: 3, sequential: false,
  status: 'sent', created_at: '2026-10-08T10:00:00+00:00', expires_at: '2026-11-07T10:00:00+00:00',
  completed_at: null, final_sha256: null,
  signers: [
    { id: 's1', name: 'Alex Lee', email: 'alex@example.com', position: 0, status: 'signed' },
    { id: 's2', name: 'Sam Ray', email: 'sam@example.com', position: 1, status: 'viewed' },
  ],
};

const showESign = (routes = {}, { guest = false } = {}) => {
  const requests = mockServer({
    '/auth/me': guest ? { status: 401 } : { body: { user: USER } },
    '/auth/config': { body: { google_client_id: '', password_login: true } },
    ...routes,
  });
  renderAt(<AuthProvider><ESign isGuest={guest} /></AuthProvider>, '/app/e-sign');
  return requests;
};

const openRequestTab = async () => {
  fireEvent.click(await screen.findByRole('tab', { name: 'Request signatures' }));
  fireEvent.change(screen.getByLabelText('Choose File', { selector: '#esign-request-file-input' }),
    { target: { files: [pdfFile()] } });
  await screen.findByRole('toolbar', { name: 'Add a field' });
};

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

test('signing yourself is the first tab', async () => {
  showESign();
  expect(await screen.findByRole('tab', { name: 'Sign yourself' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('tabpanel', { name: 'Sign yourself' })).toBeVisible();
});

test('guests are asked to create an account to request signatures', async () => {
  showESign({}, { guest: true });
  fireEvent.click(await screen.findByRole('tab', { name: 'Request signatures' }));
  const panel = screen.getByRole('tabpanel', { name: 'Request signatures' });
  expect(within(panel).getByRole('heading', { name: 'Send documents for signature' })).toBeInTheDocument();
  expect(within(panel).getByRole('button', { name: 'Create free account' })).toBeInTheDocument();
});

test('sending checks every signer has a name, email and signature field', async () => {
  const requests = showESign();
  await openRequestTab();
  expect(screen.getByText('2 of 3 signature requests left this month')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Send for signature' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Add a name for signer 1');

  fireEvent.change(screen.getByLabelText('Signer 1 name'), { target: { value: 'Alex Lee' } });
  fireEvent.change(screen.getByLabelText('Signer 1 email'), { target: { value: 'alex@' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send for signature' }));
  expect(screen.getByRole('alert')).toHaveTextContent('valid email address for Alex Lee');

  fireEvent.change(screen.getByLabelText('Signer 1 email'), { target: { value: 'alex@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send for signature' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Place a signature field for Alex Lee');
  expect(requests.some((r) => r.path === '/signature-requests')).toBe(false);
});

test('a request with two signers and their fields is sent', async () => {
  const requests = showESign({
    'POST /signature-requests': { status: 201, body: { request: REQUEST } },
  });
  await openRequestTab();

  fireEvent.change(screen.getByLabelText('Signer 1 name'), { target: { value: 'Alex Lee' } });
  fireEvent.change(screen.getByLabelText('Signer 1 email'), { target: { value: 'alex@example.com' } });
  fireEvent.click(within(screen.getByRole('toolbar', { name: 'Add a field' })).getByRole('button', { name: /Signature/ }));

  fireEvent.click(screen.getByRole('button', { name: '+ Add signer' }));
  fireEvent.change(screen.getByLabelText('Signer 2 name'), { target: { value: 'Sam Ray' } });
  fireEvent.change(screen.getByLabelText('Signer 2 email'), { target: { value: 'sam@example.com' } });
  // The new signer is selected, so the next fields are Sam's
  expect(screen.getByRole('button', { name: 'Sam' })).toHaveAttribute('aria-pressed', 'true');
  const toolbar = screen.getByRole('toolbar', { name: 'Add a field' });
  fireEvent.click(within(toolbar).getByRole('button', { name: /Signature/ }));
  fireEvent.click(within(toolbar).getByRole('button', { name: /Date/ }));
  expect(screen.getByRole('button', { name: 'Signature for Alex on page 1' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Signature for Sam on page 1' })).toBeInTheDocument();

  fireEvent.click(screen.getByLabelText(/Sign in order/));
  fireEvent.change(screen.getByLabelText('Message (optional)'), { target: { value: 'Thanks!' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send for signature' }));

  expect(await screen.findByRole('heading', { name: 'Sent for signature' })).toBeInTheDocument();
  const post = requests.find((r) => r.method === 'POST' && r.path === '/signature-requests');
  const data = JSON.parse(post.body.get('data'));
  expect(data).toMatchObject({
    title: 'lease', message: 'Thanks!', sequential: true,
    signers: [{ name: 'Alex Lee', email: 'alex@example.com' }, { name: 'Sam Ray', email: 'sam@example.com' }],
  });
  expect(data.fields.map((f) => [f.signer, f.kind, f.page])).toEqual([[0, 'signature', 0], [1, 'signature', 0], [1, 'date', 0]]);
  expect(post.body.get('file')).toBeInstanceOf(File);

  fireEvent.click(screen.getByRole('button', { name: 'Track it in Sent' }));
  await waitFor(() => expect(screen.getByRole('tab', { name: 'Sent' })).toHaveAttribute('aria-selected', 'true'));
});

test('removing a signer removes their fields', async () => {
  showESign();
  await openRequestTab();
  fireEvent.change(screen.getByLabelText('Signer 1 name'), { target: { value: 'Alex Lee' } });
  fireEvent.click(screen.getByRole('button', { name: '+ Add signer' }));
  fireEvent.change(screen.getByLabelText('Signer 2 name'), { target: { value: 'Sam Ray' } });
  fireEvent.click(within(screen.getByRole('toolbar', { name: 'Add a field' })).getByRole('button', { name: /Signature/ }));
  expect(screen.getByRole('button', { name: 'Signature for Sam on page 1' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Remove signer 2' }));
  expect(screen.queryByRole('button', { name: /for Sam/ })).toBeNull();
});

test('the Sent tab shows each signer’s progress and can send reminders', async () => {
  const requests = showESign({
    'GET /signature-requests': { body: { requests: [REQUEST] } },
    'POST /signature-requests/r1/remind': { body: { reminded: ['sam@example.com'] } },
  });
  fireEvent.click(await screen.findByRole('tab', { name: 'Sent' }));
  const list = await screen.findByRole('list', { name: 'Sent for signature' });
  expect(within(list).getByText('Lease')).toBeInTheDocument();
  expect(within(list).getByText(/1 of 2 signed/)).toBeInTheDocument();
  expect(within(list).getByText('Waiting for signatures')).toBeInTheDocument();
  expect(within(list).getByText('Signed')).toBeInTheDocument();
  expect(within(list).getByText('Opened')).toBeInTheDocument();

  fireEvent.click(within(list).getByRole('button', { name: 'Remind' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Reminder sent to sam@example.com.');
  expect(requests.some((r) => r.method === 'POST' && r.path === '/signature-requests/r1/remind')).toBe(true);
});

test('an empty Sent tab offers to request signatures', async () => {
  showESign({ 'GET /signature-requests': { body: { requests: [] } } });
  fireEvent.click(await screen.findByRole('tab', { name: 'Sent' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Request signatures' }));
  expect(screen.getByRole('tab', { name: 'Request signatures' })).toHaveAttribute('aria-selected', 'true');
});

test('a completed request offers the signed PDF, the certificate, or both', async () => {
  window.URL.createObjectURL = jest.fn(() => 'blob:fake');
  window.URL.revokeObjectURL = jest.fn();
  jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const completed = { ...REQUEST, status: 'completed', completed_at: '2026-10-08T11:00:00+00:00',
    signers: REQUEST.signers.map((s) => ({ ...s, status: 'signed' })) };
  const requests = showESign({
    'GET /signature-requests': { body: { requests: [completed] } },
    '/signature-requests/r1/document': { pdf: true },
  });
  fireEvent.click(await screen.findByRole('tab', { name: 'Sent' }));
  const list = await screen.findByRole('list', { name: 'Sent for signature' });
  expect(within(list).getByText('Completed')).toBeInTheDocument();
  for (const [label, part] of [['Signed PDF', 'signed'], ['Certificate', 'certificate'], ['Both in one PDF', 'combined']]) {
    fireEvent.click(within(list).getByRole('button', { name: label }));
    await waitFor(() => expect(within(list).getByRole('button', { name: label })).toBeEnabled());
    expect(global.fetch.mock.calls.at(-1)[0]).toContain(`/signature-requests/r1/document?part=${part}`);
  }
  expect(within(list).queryByRole('button', { name: 'Remind' })).toBeNull();
  expect(requests.filter((r) => r.path === '/signature-requests/r1/document')).toHaveLength(3);
});

test('Sent can be searched and filtered by status', async () => {
  const completed = { ...REQUEST, id: 'r2', title: 'Purchase offer', status: 'completed', folder_id: 'f1',
    signers: [{ id: 's3', name: 'Jordan Avery', email: 'jordan@example.com', position: 0, status: 'signed' }] };
  showESign({
    'GET /signature-requests': { body: { requests: [REQUEST, completed] } },
    'GET /folders': { body: { folders: [{ id: 'f1', name: '214 Willow Lane', parent_id: null }] } },
  });
  fireEvent.click(await screen.findByRole('tab', { name: 'Sent' }));
  const list = await screen.findByRole('list', { name: 'Sent for signature' });
  expect(within(list).getAllByRole('listitem').filter((li) => li.classList.contains('esign-card'))).toHaveLength(2);
  expect(await within(list).findByText('214 Willow Lane')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /^Completed/ }));
  expect(within(screen.getByRole('list', { name: 'Sent for signature' })).queryByText('Lease')).toBeNull();
  expect(screen.getByText('Purchase offer')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /^All/ }));
  fireEvent.change(screen.getByLabelText('Search sent requests'), { target: { value: 'sam@' } });
  expect(screen.getByText('Lease')).toBeInTheDocument();
  expect(screen.queryByText('Purchase offer')).toBeNull();

  fireEvent.change(screen.getByLabelText('Search sent requests'), { target: { value: 'nobody' } });
  expect(screen.getByText('No requests match.')).toBeInTheDocument();
});

test('a PDF sent from Edit PDF opens in Request signatures', async () => {
  showESign();
  await screen.findByRole('tab', { name: 'Sign yourself' });
  act(() => sendForSignature(pdfFile('lease_edited.pdf')));
  expect(await screen.findByRole('tab', { name: 'Request signatures' })).toHaveAttribute('aria-selected', 'true');
  expect(await screen.findByRole('toolbar', { name: 'Add a field' })).toBeInTheDocument();
});
