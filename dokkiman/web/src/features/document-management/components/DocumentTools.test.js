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
  expect(await screen.findByText('unfiled.pdf')).toBeInTheDocument();
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
  const row = await screen.findByRole('row', { name: /unfiled\.pdf/ });
  fireEvent.mouseEnter(row);
  fireEvent.click(within(row).getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Move to…' }));
  // The picker searches folders by path
  fireEvent.change(screen.getByLabelText('Search folders'), { target: { value: 'leases' } });
  const options = within(screen.getByRole('listbox', { name: 'Folders' })).getAllByRole('option');
  expect(options.map((o) => o.textContent)).toEqual(['214 Willow Lane › Leases']);
  fireEvent.click(screen.getByRole('button', { name: '214 Willow Lane › Leases' }));
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
  expect(await screen.findByRole('button', { name: '+ New folder' })).toBeInTheDocument();
  expect(screen.getByLabelText('Upload files')).toBeInTheDocument();

  fireEvent.click(await screen.findByRole('button', { name: /^214 Willow Lane/ }));
  expect(await screen.findByLabelText('Upload to 214 Willow Lane')).toBeInTheDocument();
});

test('search finds folders, documents and signature requests in every folder', async () => {
  renderManager();
  await screen.findByRole('list', { name: 'Folders' });
  fireEvent.change(screen.getByLabelText('Search documents'), { target: { value: 'inspection' } });
  const documents = screen.getByRole('region', { name: 'Matching documents' });
  expect(within(documents).getByText('inspection.pdf')).toBeInTheDocument();
  expect(within(documents).getByText('in 214 Willow Lane')).toBeInTheDocument();
  expect(screen.getByText('1 result for “inspection”')).toBeInTheDocument();

  // Signers are searchable too
  fireEvent.change(screen.getByLabelText('Search documents'), { target: { value: 'alex' } });
  expect(within(screen.getByRole('region', { name: 'Matching signature requests' })).getByText('Lease')).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Search documents'), { target: { value: 'leases' } });
  expect(within(screen.getByRole('region', { name: 'Matching folders' })).getByText('in 214 Willow Lane')).toBeInTheDocument();
  // Choosing a result opens its folder and clears the search
  fireEvent.click(within(screen.getByRole('region', { name: 'Matching folders' })).getByRole('button'));
  await waitFor(() => expect(screen.getByRole('navigation', { name: 'Folder path' })).toHaveTextContent('Leases'));
  expect(screen.getByLabelText('Search documents')).toHaveValue('');

  fireEvent.change(screen.getByLabelText('Search documents'), { target: { value: 'zzz' } });
  expect(screen.getByText('Nothing matches “zzz”.')).toBeInTheDocument();
});

test('folders sort A–Z or by recent activity, and the choice is remembered', async () => {
  const folders = [
    { id: 'a', name: 'Alpha', parent_id: null, created_at: '2026-01-01T00:00:00+00:00', document_count: 0, request_count: 0 },
    { id: 'b', name: 'Bravo', parent_id: null, created_at: '2026-01-02T00:00:00+00:00', document_count: 0, request_count: 1 },
  ];
  window.localStorage.removeItem('dokkiman.folderSort');
  mockFetch({
    '/folders': { body: { folders } },
    // Recent signature activity in Bravo makes it the most recently used
    '/signature-requests': { body: { requests: [{ ...REQUEST, folder_id: 'b', created_at: '2026-09-01T00:00:00+00:00' }] } },
  });
  renderAt(<DocumentTools documents={[]} />, '/app/documents');
  const names = () => within(screen.getByRole('list', { name: 'Folders' }))
    .getAllByRole('button', { name: /^(Alpha|Bravo)/ })
    .map((button) => button.textContent.match(/^(Alpha|Bravo)/)[1]);
  await waitFor(() => expect(names()).toEqual(['Alpha', 'Bravo']));
  fireEvent.change(screen.getByLabelText('Sort folders'), { target: { value: 'recent' } });
  expect(names()).toEqual(['Bravo', 'Alpha']);
  expect(window.localStorage.getItem('dokkiman.folderSort')).toBe('recent');
});

const movesOf = (fetchMock) => fetchMock.mock.calls
  .filter(([url, options = {}]) => url.endsWith('/folders/move') && options.method === 'POST')
  .map(([, options]) => JSON.parse(options.body));

test('a new folder can be created with documents from anywhere moved into it', async () => {
  const fetchMock = renderManager('/app/documents', {
    '/folders': (url, options) => (options.method === 'POST'
      ? { status: 201, body: { folder: { id: 'f9', name: 'Oak Street', parent_id: null } } }
      : { body: { folders: FOLDERS } }),
    '/folders/move': { body: { moved: 2, folder_id: 'f9' } },
  }).fetchMock;
  fireEvent.click(await screen.findByRole('button', { name: '+ New folder' }));
  fireEvent.change(screen.getByLabelText('Folder name'), { target: { value: 'Oak Street' } });
  fireEvent.click(screen.getByRole('button', { name: 'Choose documents…' }));

  const picker = screen.getByRole('dialog', { name: 'Choose documents for the new folder' });
  // Documents from the top level and from folders, each saying where it is
  expect(within(picker).getByText('in 214 Willow Lane')).toBeInTheDocument();
  expect(within(picker).getByText('in All documents')).toBeInTheDocument();
  fireEvent.click(within(picker).getByRole('checkbox', { name: /inspection\.pdf/ }));
  fireEvent.click(within(picker).getByRole('checkbox', { name: /^Lease/ }));
  fireEvent.click(within(picker).getByRole('button', { name: 'Use 2 selected' }));

  expect(screen.getByText('1 document and 1 signature request will be moved into the new folder.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Create' }));
  await waitFor(() => expect(movesOf(fetchMock)).toHaveLength(1));
  expect(movesOf(fetchMock)[0]).toEqual({ folder_id: 'f9', document_ids: ['d1'], request_ids: ['r1'] });
});

test('inside a folder, Add documents pulls in documents from elsewhere', async () => {
  const { fetchMock, refreshDocuments } = renderManager('/app/documents?folder=f2', {
    '/folders/move': { body: { moved: 1, folder_id: 'f2' } },
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Add documents' }));
  const picker = screen.getByRole('dialog', { name: 'Add documents to Leases' });
  const move = within(picker).getByRole('button', { name: 'Move here' });
  expect(move).toBeDisabled(); // nothing chosen yet

  // Search narrows the list
  fireEvent.change(within(picker).getByLabelText('Search documents to add'), { target: { value: 'unfiled' } });
  expect(within(picker).queryByText('inspection.pdf')).toBeNull();
  fireEvent.click(within(picker).getByRole('checkbox', { name: /unfiled\.pdf/ }));
  fireEvent.click(within(picker).getByRole('button', { name: 'Move 1 here' }));

  await waitFor(() => expect(movesOf(fetchMock)).toHaveLength(1));
  expect(movesOf(fetchMock)[0]).toEqual({ folder_id: 'f2', document_ids: ['d2'], request_ids: [] });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(refreshDocuments).toHaveBeenCalled();
});

test('items already in the folder are shown but can’t be picked', async () => {
  renderManager('/app/documents?folder=f1');
  fireEvent.click(await screen.findByRole('button', { name: 'Add documents' }));
  const picker = screen.getByRole('dialog', { name: 'Add documents to 214 Willow Lane' });
  const already = within(picker).getByRole('checkbox', { name: /inspection\.pdf/ });
  expect(already).toBeDisabled();
  expect(already).toBeChecked();
  expect(within(picker).getAllByText('Already in this folder').length).toBeGreaterThan(0);
});
