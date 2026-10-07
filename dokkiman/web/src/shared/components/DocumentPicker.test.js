import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import DocumentPicker from './DocumentPicker';
import { mockFetch } from '../../test-utils/mockFetch';

const DOCUMENTS = [
  { id: 'd1', filename: 'transcript.pdf', has_file: true, file_size: 2 * 1024 * 1024, processing_timestamp: '2026-10-05T12:00:00' },
  { id: 'd2', filename: 'old-upload.pdf', has_file: false },
  { id: 'd3', filename: 'letter.docx', has_file: true, file_size: 2048 },
  { id: 'd4', filename: 'notes.txt', has_file: true },
];

const openPicker = async (props = {}) => {
  const onSelect = jest.fn();
  render(<DocumentPicker onSelect={onSelect} {...props} />);
  fireEvent.click(screen.getByRole('button', { name: /Document Manager/ }));
  await screen.findByRole('dialog');
  return onSelect;
};

const items = () => within(screen.getByRole('dialog')).queryAllByRole('button', { name: /\.(pdf|docx|txt)/ });

test('lists only documents of the accepted type', async () => {
  mockFetch({ '/getDocuments': { body: DOCUMENTS } });
  await openPicker({ acceptedExtensions: ['.pdf'] });

  await waitFor(() => expect(items()).toHaveLength(2));
  expect(items()[0]).toHaveTextContent('transcript.pdf');
  expect(items()[0]).toHaveTextContent('2.00 MB');
  expect(screen.queryByText('letter.docx')).toBeNull();
  expect(screen.queryByText('notes.txt')).toBeNull();
});

test('documents without a stored original are disabled unless allowed', async () => {
  mockFetch({ '/getDocuments': { body: DOCUMENTS } });
  await openPicker();
  const oldUpload = await screen.findByRole('button', { name: /old-upload\.pdf/ });
  expect(oldUpload).toBeDisabled();
  expect(oldUpload).toHaveTextContent('Original file not stored');
});

test('chat can use a document without a stored original', async () => {
  mockFetch({ '/getDocuments': { body: DOCUMENTS } });
  const onSelect = await openPicker({ allowWithoutFile: true });

  fireEvent.click(await screen.findByRole('button', { name: /old-upload\.pdf/ }));
  expect(onSelect).toHaveBeenCalledWith(null, DOCUMENTS[1]);
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('picking a document downloads it and hands over a File', async () => {
  const fetchMock = mockFetch({
    '/getDocuments': { body: DOCUMENTS },
    '/documents/d3/file': { file: new Blob(['docx bytes']) },
  });
  const onSelect = await openPicker({ acceptedExtensions: ['.docx'] });

  fireEvent.click(await screen.findByRole('button', { name: /letter\.docx/ }));

  await waitFor(() => expect(onSelect).toHaveBeenCalled());
  const [file, doc] = onSelect.mock.calls[0];
  expect(file).toBeInstanceOf(File);
  expect(file.name).toBe('letter.docx');
  expect(file.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  expect(doc.id).toBe('d3');
  expect(fetchMock.mock.calls.some(([url, options]) => url.endsWith('/documents/d3/file') && options.credentials === 'include')).toBe(true);
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('shows an error if the file cannot be downloaded', async () => {
  mockFetch({
    '/getDocuments': { body: DOCUMENTS },
    '/documents/d1/file': { status: 404, body: { error: "The original file for this document isn't stored." } },
  });
  const onSelect = await openPicker();

  fireEvent.click(await screen.findByRole('button', { name: /transcript\.pdf/ }));
  expect(await screen.findByRole('alert')).toHaveTextContent("isn't stored");
  expect(onSelect).not.toHaveBeenCalled();
});

test('empty state, and Escape closes the dialog', async () => {
  mockFetch({ '/getDocuments': { body: [] } });
  await openPicker({ acceptedExtensions: ['.docx'] });

  expect(await screen.findByText(/No DOCX files in your Document Manager yet/)).toBeInTheDocument();
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
});
