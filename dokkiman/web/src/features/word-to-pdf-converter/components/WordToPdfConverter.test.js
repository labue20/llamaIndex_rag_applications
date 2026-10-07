import { fireEvent, render, screen } from '@testing-library/react';
import WordToPdfConverter from './WordToPdfConverter';
import { mockFetch } from '../../../test-utils/mockFetch';

test('a Word document can be picked from the Document Manager', async () => {
  mockFetch({
    '/getDocuments': { body: [{ id: 'd3', filename: 'letter.docx', has_file: true }] },
    '/documents/d3/file': { file: new Blob(['docx bytes']) },
  });
  render(<WordToPdfConverter />);

  fireEvent.click(screen.getByRole('button', { name: /Document Manager/ }));
  fireEvent.click(await screen.findByRole('button', { name: /letter\.docx/ }));

  expect(await screen.findByRole('button', { name: /Convert to PDF/ })).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByText('letter.docx')).toBeInTheDocument();
});
