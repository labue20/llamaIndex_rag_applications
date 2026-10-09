import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ToolPage from './ToolPage';
import TOOL_PAGES from '../../../seo/toolPages.json';

const pageAt = (path) => TOOL_PAGES.find((p) => p.path === path);
const showPage = (path) => {
  const onOpen = jest.fn();
  render(<MemoryRouter><ToolPage page={pageAt(path)} onOpen={onOpen} /></MemoryRouter>);
  return { onOpen };
};
const pdf = (name) => new File(['%PDF'], name, { type: 'application/pdf' });

test('shows what the tool does, how to use it, and answers to common questions', () => {
  showPage('/compress-pdf');
  expect(screen.getByRole('heading', { level: 1, name: 'Compress PDF' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'How to compress a PDF' })).toBeInTheDocument();
  expect(screen.getByText('Pick a level')).toBeInTheDocument();
  expect(screen.getByText('How much smaller will my PDF get?')).toBeInTheDocument();
  // Links to other tools' pages
  const related = screen.getByRole('region', { name: 'More PDF tools' });
  expect(within(related).getAllByRole('link').map((l) => l.getAttribute('href')))
    .toEqual(['/split-pdf', '/merge-pdf', '/edit-pdf']);
});

test('choosing a file opens the tool with it', () => {
  const { onOpen } = showPage('/compress-pdf');
  const input = screen.getByLabelText(/Choose a PDF to compress/);
  expect(input).toHaveAttribute('accept', '.pdf');
  fireEvent.change(input, { target: { files: [pdf('scan.pdf')] } });
  expect(onOpen).toHaveBeenCalledWith([expect.objectContaining({ name: 'scan.pdf' })]);
});

test('Merge PDF takes several files, and files can be dropped', () => {
  const { onOpen } = showPage('/merge-pdf');
  const input = screen.getByLabelText(/Choose files to merge/);
  expect(input).toHaveAttribute('multiple');
  // Dropped anywhere on the drop area (the drop bubbles up to it)
  fireEvent.drop(input, {
    dataTransfer: { files: [pdf('a.pdf'), pdf('b.pdf')] },
  });
  expect(onOpen.mock.calls[0][0].map((f) => f.name)).toEqual(['a.pdf', 'b.pdf']);
});

test('Chat with PDF opens the tool, where the PDF is uploaded', () => {
  const { onOpen } = showPage('/chat-with-pdf');
  fireEvent.click(screen.getByRole('button', { name: /Upload a PDF and ask/ }));
  expect(onOpen).toHaveBeenCalledWith([]);
});

test('every tool page has what search engines and the page need', () => {
  const paths = TOOL_PAGES.map((p) => p.path);
  expect(new Set(paths).size).toBe(paths.length);
  TOOL_PAGES.forEach((page) => {
    expect(page.title.length).toBeLessThanOrEqual(60);
    expect(page.description.length).toBeLessThanOrEqual(160);
    ['h1', 'lead', 'cta', 'howTo', 'app', 'icon'].forEach((key) => expect(page[key]).toBeTruthy());
    expect(page.steps).toHaveLength(3);
    page.related.forEach((path) => expect(paths).toContain(path));
  });
});
