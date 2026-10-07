import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PdfChat from './PdfChat';
import { mockFetch } from '../../../test-utils/mockFetch';

test('picking from the Document Manager opens that document for chat without re-uploading', async () => {
  const fetchMock = mockFetch({
    '/getDocuments': { body: [{ id: 'doc-42', filename: 'transcript.pdf', has_file: false }] },
    '/chat': { body: { response: 'Page 7 lists the refund date.', document_name: 'transcript.pdf' } },
  });
  render(<PdfChat />);

  fireEvent.click(screen.getByRole('button', { name: /Document Manager/ }));
  fireEvent.click(await screen.findByRole('button', { name: /transcript\.pdf/ }));

  // Straight into the chat: ready, no upload
  expect(await screen.findByText('Ready')).toBeInTheDocument();
  expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/uploadFile'))).toBe(false);

  const input = screen.getByRole('textbox', { name: 'Ask a question about your PDF' });
  fireEvent.change(input, { target: { value: 'What is on page 7?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

  expect(await screen.findByText('Page 7 lists the refund date.')).toBeInTheDocument();
  const chatCall = fetchMock.mock.calls.find(([url]) => url.endsWith('/chat'));
  expect(JSON.parse(chatCall[1].body)).toEqual({ message: 'What is on page 7?', documentId: 'doc-42' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

test('Word and other documents from the Document Manager can be chatted with, with a text preview', async () => {
  const fetchMock = mockFetch({
    '/getDocuments': {
      body: [
        { id: 'doc-r', filename: 'wilfred-labue_resume.docx', has_file: true },
        { id: 'doc-n', filename: 'notes.txt', has_file: true },
      ],
    },
    '/getFullDocument/doc-r': { body: { preview_text: 'Wilfred Labue\nSoftware engineer with RAG experience.' } },
    '/chat': { body: { response: 'Five years of experience.' } },
  });
  render(<PdfChat />);

  fireEvent.click(screen.getByRole('button', { name: /Document Manager/ }));
  expect(await screen.findByRole('button', { name: /notes\.txt/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /wilfred-labue_resume\.docx/ }));

  // The preview shows the document's text, labelled as a Word document
  expect(await screen.findByText(/Software engineer with RAG experience/)).toBeInTheDocument();
  expect(screen.getByText('Word document')).toBeInTheDocument();
  // A Word file isn't downloaded for the PDF viewer
  expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/documents/doc-r/file'))).toBe(false);

  fireEvent.change(screen.getByRole('textbox', { name: 'Ask a question about your PDF' }), {
    target: { value: 'How much experience?' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  expect(await screen.findByText('Five years of experience.')).toBeInTheDocument();
  const chatCall = fetchMock.mock.calls.find(([url]) => url.endsWith('/chat'));
  expect(JSON.parse(chatCall[1].body).documentId).toBe('doc-r');
});


test('PDF text previews keep page headings and line breaks, one page per view', async () => {
  mockFetch({
    '/getDocuments': { body: [{ id: 'doc-t', filename: 'transcript.pdf', has_file: false }] },
    '/getFullDocument/doc-t': {
      body: { preview_text: '--- Page 1 ---\nForm 1040\nTax year 2024\n\n--- Page 2 ---\nCode 846 Refund issued' },
    },
  });
  render(<PdfChat />);

  fireEvent.click(screen.getByRole('button', { name: /Document Manager/ }));
  fireEvent.click(await screen.findByRole('button', { name: /transcript\.pdf/ }));

  // Pages are worked out right after the text arrives
  expect(await screen.findByText('Page 1 of 2')).toBeInTheDocument();
  expect(screen.getByText(/--- Page 1 ---/).textContent).toBe('--- Page 1 ---\nForm 1040\nTax year 2024');
  expect(screen.queryByText(/Code 846/)).toBeNull();
});
