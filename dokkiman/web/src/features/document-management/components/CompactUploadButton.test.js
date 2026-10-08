import { fireEvent, screen, waitFor } from '@testing-library/react';
import CompactUploadButton from './CompactUploadButton';
import { mockFetch } from '../../../test-utils/mockFetch';
import { renderAt } from '../../../test-utils/router';

test('Upload files uploads the chosen file straight away', async () => {
  const fetchMock = mockFetch({ '/uploadFile': { body: { doc_id: 'doc-1', message: 'File processed successfully!' } } });
  const onUploadSuccess = jest.fn();
  renderAt(<CompactUploadButton onUploadSuccess={onUploadSuccess} />, '/app/documents');

  const input = screen.getByLabelText('Upload files');
  expect(input).toHaveAttribute('accept', '.pdf,.txt,.json,.md,.docx');

  fireEvent.change(input, { target: { files: [new File(['%PDF'], 'report.pdf', { type: 'application/pdf' })] } });

  await waitFor(() => expect(onUploadSuccess).toHaveBeenCalledWith(expect.objectContaining({ doc_id: 'doc-1' })));
  const [url, options] = fetchMock.mock.calls.find(([calledUrl]) => calledUrl.endsWith('/uploadFile'));
  expect(url).toMatch(/\/uploadFile$/);
  expect(options.body.get('file').name).toBe('report.pdf');
  expect(await screen.findByRole('status')).toHaveTextContent('Uploaded report.pdf');
});

test('shows why an upload failed', async () => {
  mockFetch({ '/uploadFile': { status: 500, body: { error: 'Failed to load document: the file is damaged' } } });
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const onUploadSuccess = jest.fn();
  renderAt(<CompactUploadButton onUploadSuccess={onUploadSuccess} />, '/app/documents');

  fireEvent.change(screen.getByLabelText('Upload files'), {
    target: { files: [new File(['x'], 'letter.docx')] },
  });

  expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load document: the file is damaged');
  expect(onUploadSuccess).not.toHaveBeenCalled();
});

test('with a folder open, the upload is filed in it', async () => {
  const fetchMock = mockFetch({
    '/uploadFile': { body: { doc_id: 'doc-1' } },
    '/folders/move': { body: { moved: 1, folder_id: 'f1' } },
  });
  const onUploadSuccess = jest.fn();
  renderAt(<CompactUploadButton onUploadSuccess={onUploadSuccess} />, '/app/documents?folder=f1');
  fireEvent.change(screen.getByLabelText('Upload files'), {
    target: { files: [new File(['%PDF'], 'lease.pdf', { type: 'application/pdf' })] },
  });
  expect(await screen.findByRole('status')).toHaveTextContent('Uploaded lease.pdf');
  const [, options] = fetchMock.mock.calls.find(([url]) => url.endsWith('/folders/move'));
  expect(JSON.parse(options.body)).toEqual({ folder_id: 'f1', document_ids: ['doc-1'], request_ids: [] });
  expect(onUploadSuccess).toHaveBeenCalled();
});
