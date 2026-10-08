import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderAt } from '../../../test-utils/router';
import SigningPage from './SigningPage';
import { mockCanvas, mockServer } from './testHelpers';

const INFO = {
  title: 'Lease', message: 'Please sign by Friday', sender: 'owner@example.com', file_name: 'lease.pdf',
  page_count: 2, signer: { name: 'Sam Ray', email: 'sam@example.com' }, signer_count: 2,
  fields: [
    { id: 1, kind: 'signature', page: 0, x: 0.1, y: 0.7, width: 0.3, height: 0.05 },
    { id: 2, kind: 'date', page: 0, x: 0.5, y: 0.7, width: 0.2, height: 0.03 },
    { id: 3, kind: 'initials', page: 1, x: 0.1, y: 0.9, width: 0.1, height: 0.04 },
  ],
  can_sign: true, reason: null, expires_at: '2026-11-07T00:00:00+00:00',
};

const openLink = (routes) => {
  const requests = mockServer({
    'GET /signing/tok123': { body: INFO },
    'GET /signing/tok123/document': { pdf: true },
    ...routes,
  });
  renderAt(<Routes><Route path='/sign/:token' element={<SigningPage />} /></Routes>, '/sign/tok123');
  return requests;
};

const adopt = async (fieldName, typed = 'Sam Ray') => {
  fireEvent.click(screen.getAllByRole('button', { name: fieldName })[0]);
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText(/Your (full name|initials)/), { target: { value: typed } });
  fireEvent.click(within(dialog).getByRole('button', { name: /^Add / }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
};

beforeEach(() => {
  mockCanvas();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

test('shows who sent the document and the fields to fill in', async () => {
  openLink();
  expect(await screen.findByRole('heading', { name: 'Lease' })).toBeInTheDocument();
  expect(screen.getByText('owner@example.com')).toBeInTheDocument();
  expect(screen.getByText('Please sign by Friday')).toBeInTheDocument();
  expect(await screen.findByRole('button', { name: 'Signature, page 1' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Initials, page 2' })).toBeInTheDocument();
  expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
});

test('signing needs each signature, then consent', async () => {
  const requests = openLink({ 'POST /signing/tok123': { body: { signed: true, completed: false } } });
  await screen.findByRole('button', { name: 'Signature, page 1' });

  fireEvent.click(screen.getByRole('button', { name: 'Finish signing' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Add your signature first');

  await adopt('Signature, page 1');
  await adopt('Initials, page 2', 'SR');
  expect(screen.getByRole('button', { name: 'Signature (added), page 1' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Finish signing' }));
  expect(screen.getByRole('alert')).toHaveTextContent('agree to sign electronically');

  fireEvent.click(screen.getByLabelText(/I agree to sign this document electronically/));
  fireEvent.click(screen.getByRole('button', { name: 'Finish signing' }));
  expect(await screen.findByRole('heading', { name: 'You’ve signed!' })).toBeInTheDocument();
  expect(screen.getByText(/When everyone has signed, you’ll get the signed PDF by email/)).toBeInTheDocument();

  const post = requests.find((r) => r.method === 'POST');
  expect(post.path).toBe('/signing/tok123');
  expect(post.body.get('consent')).toBe('true');
  expect(post.body.get('signature')).toBeInstanceOf(Blob);
  expect(post.body.get('initials')).toBeInstanceOf(Blob);
});

test('the last signer is told everyone has signed', async () => {
  openLink({ 'POST /signing/tok123': { body: { signed: true, completed: true } } });
  await screen.findByRole('button', { name: 'Signature, page 1' });
  await adopt('Signature, page 1');
  await adopt('Initials, page 2', 'SR');
  fireEvent.click(screen.getByLabelText(/I agree/));
  fireEvent.click(screen.getByRole('button', { name: 'Finish signing' }));
  expect(await screen.findByText(/The signed PDF is on its way to your email/)).toBeInTheDocument();
});

test('declining sends the reason', async () => {
  const requests = openLink({ 'POST /signing/tok123/decline': { body: { declined: true } } });
  fireEvent.click(await screen.findByRole('button', { name: 'I don’t want to sign this' }));
  fireEvent.change(screen.getByLabelText(/Why are you declining/), { target: { value: 'Wrong rent' } });
  fireEvent.click(screen.getByRole('button', { name: 'Decline to sign' }));
  expect(await screen.findByRole('heading', { name: 'You declined to sign' })).toBeInTheDocument();
  const post = requests.find((r) => r.path === '/signing/tok123/decline');
  expect(JSON.parse(post.body)).toEqual({ reason: 'Wrong rent' });
});

test.each([
  ['signed', 'You’ve already signed'],
  ['not_your_turn', 'It isn’t your turn yet'],
  ['expired', 'This request has expired'],
  ['cancelled', 'This request was cancelled'],
])('a closed request explains why (%s)', async (reason, heading) => {
  openLink({ 'GET /signing/tok123': { body: { ...INFO, can_sign: false, reason } } });
  expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Finish signing' })).toBeNull();
});

test('an unknown or replaced link says so', async () => {
  openLink({ 'GET /signing/tok123': { status: 404, body: { error: 'This signing link isn’t valid anymore.' } } });
  expect(await screen.findByRole('heading', { name: 'This link can’t be used' })).toBeInTheDocument();
  expect(screen.getByText('This signing link isn’t valid anymore.')).toBeInTheDocument();
});
