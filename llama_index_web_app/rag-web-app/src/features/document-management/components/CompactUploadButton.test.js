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
  expect(screen.getByLabelText('Upload files')).toBeInTheDocument();
});
