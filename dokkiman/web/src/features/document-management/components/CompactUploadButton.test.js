import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CompactUploadButton from './CompactUploadButton';
import { mockFetch } from '../../../test-utils/mockFetch';

test('Upload files uploads the chosen file straight away', async () => {
  const fetchMock = mockFetch({ '/uploadFile': { body: { doc_id: 'doc-1', message: 'File processed successfully!' } } });
  const onUploadSuccess = jest.fn();
  render(<CompactUploadButton onUploadSuccess={onUploadSuccess} />);

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
  render(<CompactUploadButton onUploadSuccess={onUploadSuccess} />);

  fireEvent.change(screen.getByLabelText('Upload files'), {
    target: { files: [new File(['x'], 'letter.docx')] },
  });

  expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load document: the file is damaged');
  expect(onUploadSuccess).not.toHaveBeenCalled();
});
