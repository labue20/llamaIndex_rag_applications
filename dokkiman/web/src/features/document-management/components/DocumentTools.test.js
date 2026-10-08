import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { mockFetch } from '../../../test-utils/mockFetch';
import { CurrentPath, renderAt } from '../../../test-utils/router';
import DocumentTools from './DocumentTools';

const FOLDERS = [
  { id: 'f1', name: '214 Willow Lane', parent_id: null, document_count: 1, request_count: 1 },
  { id: 'f2', name: 'Leases', parent_id: 'f1', document_count: 0, request_count: 0 },
];
const DOCUMENTS = [
  { id: 'd1', filename: 'inspection.pdf', file_type: '.pdf', folder_id: 'f1' },
  { id: 'd2', filename: 'unfiled.pdf', file_type: '.pdf', folder_id: null },
];
const REQUEST = {
  id: 'r1', title: 'Lease', file_name: 'lease.pdf', status: 'completed', folder_id: 'f1',
  signers: [{ id: 's1', name: 'Alex Lee', email: 'alex@example.com', status: 'signed' }],
};

const renderManager = (route = '/app/documents', routes = {}) => {
  const fetchMock = mockFetch({
    '/folders': { body: { folders: FOLDERS } },
    '/signature-requests': { body: { requests: [REQUEST] } },
    '/getDocuments': { body: DOCUMENTS },
    ...routes,
  });
  const refreshDocuments = jest.fn();
  renderAt(<><DocumentTools documents={DOCUMENTS} refreshDocuments={refreshDocuments} /><CurrentPath /></>, route);
  return { fetchMock, refreshDocuments };
};

const calls = (fetchMock, path, method) =>
  fetchMock.mock.calls.filter(([url, options = {}]) => url.endsWith(path) && (options.method || 'GET') === method);

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

test('the top level shows top folders and documents not in a folder', async () => {
  renderManager();
  const list = await screen.findByRole('list', { name: 'Folders' });
  expect(within(list).getByText('214 Willow Lane')).toBeInTheDocument();
  expect(within(list).getByText('1 folder · 1 document · 1 signature request')).toBeInTheDocument();
  expect(within(list).queryByText('Leases')).toBeNull(); // a subfolder
  expect(screen.getByText('unfiled.pdf')).toBeInTheDocument();
  expect(screen.queryByText('inspection.pdf')).toBeNull();
});

test('opening a folder shows its subfolders, documents and signed copies', async () => {
  renderManager();
  fireEvent.click(await screen.findByRole('button', { name: /^214 Willow Lane/ }));
  await waitFor(() => expect(screen.getByRole('navigation', { name: 'Folder path' })).toHaveTextContent('All documents›214 Willow Lane'));
  expect(screen.getByText('inspection.pdf')).toBeInTheDocument();
  expect(screen.queryByText('unfiled.pdf')).toBeNull();
  expect(within(screen.getByRole('list', { name: 'Folders' })).getByText('Leases')).toBeInTheDocument();
  const requests = screen.getByRole('region', { name: 'Signature requests' });
  expect(within(requests).getByText('Lease')).toBeInTheDocument();
  expect(within(requests).getByText('Completed')).toBeInTheDocument();
  expect(within(requests).getByRole('button', { name: 'Signed PDF' })).toBeInTheDocument();
  expect(within(requests).getByRole('button', { name: 'Certificate' })).toBeInTheDocument();

  // Back to the top through the path
  fireEvent.click(screen.getByRole('button', { name: /All documents/ }));
  await waitFor(() => expect(screen.getByText('unfiled.pdf')).toBeInTheDocument());
});

test('subfolders can’t have folders of their own', async () => {
  renderManager('/app/documents?folder=f2');
  await screen.findByRole('navigation', { name: 'Folder path' });
  await waitFor(() => expect(screen.getByRole('navigation', { name: 'Folder path' })).toHaveTextContent('Leases'));
  expect(screen.queryByRole('button', { name: '+ New folder' })).toBeNull();
  expect(screen.getByText(/No documents in this folder yet/)).toBeInTheDocument();
});

test('creating a folder', async () => {
  const { fetchMock } = renderManager('/app/documents', {
    '/folders': (url, options) => (options.method === 'POST'
      ? { status: 201, body: { folder: { id: 'f3', name: 'Oak Street', parent_id: null } } }
      : { body: { folders: FOLDERS } }),
  });
  fireEvent.click(await screen.findByRole('button', { name: '+ New folder' }));
  fireEvent.change(screen.getByLabelText('Folder name'), { target: { value: 'Oak Street' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create' }));
  await waitFor(() => expect(calls(fetchMock, '/folders', 'POST')).toHaveLength(1));
  expect(JSON.parse(calls(fetchMock, '/folders', 'POST')[0][1].body)).toEqual({ name: 'Oak Street', parent_id: null });
  await waitFor(() => expect(screen.queryByLabelText('Folder name')).toBeNull());
});

test('a duplicate folder name is explained', async () => {
  renderManager('/app/documents', {
    '/folders': (url, options) => (options.method === 'POST'
      ? { status: 409, body: { error: 'There’s already a folder called “214 Willow Lane” here.' } }
      : { body: { folders: FOLDERS } }),
  });
  fireEvent.click(await screen.findByRole('button', { name: '+ New folder' }));
  fireEvent.change(screen.getByLabelText('Folder name'), { target: { value: '214 Willow Lane' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('already a folder called');
});

test('renaming and deleting folders', async () => {
  const { fetchMock } = renderManager('/app/documents', {
    '/folders/f1': (url, options) => (options.method === 'PATCH'
      ? { body: { folder: { ...FOLDERS[0], name: 'Willow' } } }
      : { body: { deleted: true } }),
  });
  jest.spyOn(window, 'prompt').mockReturnValue('Willow');
  jest.spyOn(window, 'confirm').mockReturnValue(true);
  fireEvent.click(await screen.findByRole('button', { name: 'Rename 214 Willow Lane' }));
  await waitFor(() => expect(calls(fetchMock, '/folders/f1', 'PATCH')).toHaveLength(1));
  expect(JSON.parse(calls(fetchMock, '/folders/f1', 'PATCH')[0][1].body)).toEqual({ name: 'Willow' });

  fireEvent.click(screen.getByRole('button', { name: 'Delete 214 Willow Lane' }));
  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Nothing in it is deleted'));
  await waitFor(() => expect(calls(fetchMock, '/folders/f1', 'DELETE')).toHaveLength(1));
});

test('selected documents can be moved to a folder', async () => {
  const { fetchMock, refreshDocuments } = renderManager('/app/documents', {
    '/folders/move': { body: { moved: 1, folder_id: 'f2' } },
  });
  const row = (await screen.findByText('unfiled.pdf')).closest('tr');
  fireEvent.mouseEnter(row);
  fireEvent.click(within(row).getByRole('checkbox'));
  const menu = screen.getByLabelText('Move selected documents to');
  expect(within(menu).getByRole('option', { name: '214 Willow Lane › Leases' })).toBeInTheDocument();
  fireEvent.change(menu, { target: { value: 'f2' } });
  await waitFor(() => expect(calls(fetchMock, '/folders/move', 'POST')).toHaveLength(1));
  expect(JSON.parse(calls(fetchMock, '/folders/move', 'POST')[0][1].body))
    .toEqual({ folder_id: 'f2', document_ids: ['d2'], request_ids: [] });
  await waitFor(() => expect(refreshDocuments).toHaveBeenCalled());
});

test('a link to a folder that no longer exists goes back to the top', async () => {
  renderManager('/app/documents?folder=gone');
  await waitFor(() => expect(screen.getByTestId('current-path')).toHaveTextContent(/^\/app\/documents$/));
  expect(await screen.findByText('unfiled.pdf')).toBeInTheDocument();
});

test('Upload files sits next to New folder and says which folder it uploads to', async () => {
  renderManager();
  const bar = (await screen.findByRole('navigation', { name: 'Folder path' })).parentElement;
  expect(within(bar).getByRole('button', { name: '+ New folder' })).toBeInTheDocument();
  expect(within(bar).getByLabelText('Upload files')).toBeInTheDocument();

  fireEvent.click(await screen.findByRole('button', { name: /^214 Willow Lane/ }));
  expect(await within(bar).findByLabelText('Upload to 214 Willow Lane')).toBeInTheDocument();
});
