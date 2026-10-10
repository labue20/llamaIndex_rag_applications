import { useRef, useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import SplitPdf from './SplitPdf';
import { ConverterHeaderActions } from '../../../shared';

const pdf = (name = 'report.pdf') => new File(['%PDF'], name, { type: 'application/pdf' });

// Fake /splitPdf: records the form it receives and answers with a file or an error
const mockSplitServer = ({ status = 200, type = 'application/zip', fileName = 'report_split.zip', error } = {}) => {
  const requests = [];
  global.fetch = jest.fn((url, options) => {
    requests.push({ url, form: options.body });
    if (status !== 200) {
      return Promise.resolve({ ok: false, status, json: () => Promise.resolve({ error }) });
    }
    return Promise.resolve({
      ok: true,
      status,
      blob: () => Promise.resolve(new Blob(['data'], { type })),
      headers: { get: (name) => (name === 'Content-Disposition' ? `attachment; filename=${fileName}` : null) },
    });
  });
  return requests;
};

const choosePdf = (file = pdf()) =>
  fireEvent.change(screen.getByLabelText('Choose PDF File'), { target: { files: [file] } });

const splitButton = () => screen.getByRole('button', { name: /Split PDF/ });

beforeEach(() => {
  // jsdom can't draw; the page previews only need a context to exist
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({}));
  window.URL.createObjectURL = jest.fn(() => 'blob:fake');
  window.URL.revokeObjectURL = jest.fn();
  jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

test('splits every page and downloads the ZIP under the server-given name', async () => {
  const requests = mockSplitServer();
  render(<SplitPdf />);
  choosePdf();

  expect(screen.getByRole('radio', { name: /Every page/ })).toBeChecked();
  expect(screen.queryByLabelText('Pages')).toBeNull();
  fireEvent.click(splitButton());

  expect(await screen.findByRole('status')).toHaveTextContent('Downloaded report_split.zip');
  expect(requests[0].url).toMatch(/\/splitPdf$/);
  expect(requests[0].form.get('mode')).toBe('every');
  expect(requests[0].form.get('ranges')).toBeNull();
  expect(requests[0].form.get('file').name).toBe('report.pdf');
});

test('custom ranges are required and sent to the server', async () => {
  const requests = mockSplitServer({ type: 'application/pdf', fileName: 'report_pages_1-2.pdf' });
  render(<SplitPdf />);
  choosePdf();

  fireEvent.click(screen.getByRole('radio', { name: /Custom ranges/ }));
  fireEvent.click(splitButton());
  expect(screen.getByRole('alert')).toHaveTextContent('Enter the pages to use');
  expect(requests).toHaveLength(0);

  fireEvent.change(screen.getByLabelText('Pages'), { target: { value: '1-2' } });
  fireEvent.click(splitButton());

  expect(await screen.findByRole('status')).toHaveTextContent('Downloaded report_pages_1-2.pdf');
  expect(requests[0].form.get('mode')).toBe('ranges');
  expect(requests[0].form.get('ranges')).toBe('1-2');
});

test('extract mode sends the selected pages', async () => {
  const requests = mockSplitServer({ type: 'application/pdf', fileName: 'report_extracted.pdf' });
  render(<SplitPdf />);
  choosePdf();

  fireEvent.click(screen.getByRole('radio', { name: /Extract pages/ }));
  fireEvent.change(screen.getByLabelText('Pages'), { target: { value: '3, 1' } });
  fireEvent.click(splitButton());

  expect(await screen.findByRole('status')).toHaveTextContent('Downloaded report_extracted.pdf');
  expect(requests[0].form.get('mode')).toBe('extract');
  expect(requests[0].form.get('ranges')).toBe('3, 1');
});

test("shows the server's error message", async () => {
  mockSplitServer({ status: 400, error: '"2-9" goes past the last page. This PDF has 3 pages.' });
  jest.spyOn(console, 'error').mockImplementation(() => {});
  render(<SplitPdf />);
  choosePdf();

  fireEvent.click(screen.getByRole('radio', { name: /Custom ranges/ }));
  fireEvent.change(screen.getByLabelText('Pages'), { target: { value: '2-9' } });
  fireEvent.click(splitButton());

  expect(await screen.findByRole('alert')).toHaveTextContent('"2-9" goes past the last page. This PDF has 3 pages.');
  expect(screen.queryByRole('status')).toBeNull();
});

test('refuses files that are not PDFs', () => {
  jest.spyOn(window, 'alert').mockImplementation(() => {});
  render(<SplitPdf />);
  choosePdf(new File(['x'], 'notes.docx', { type: 'application/msword' }));
  expect(window.alert).toHaveBeenCalledWith('Please select a valid PDF file');
  expect(screen.queryByRole('button', { name: /Split PDF/ })).toBeNull();
});

test('the header toolbar loads a new document and closes it', async () => {
  mockSplitServer();
  const Page = () => {
    const splitRef = useRef(null);
    const [status, setStatus] = useState({ hasFile: false, isBusy: false });
    return (
      <>
        <ConverterHeaderActions converterRef={splitRef} status={status} acceptedTypes='.pdf' />
        <SplitPdf ref={splitRef} onStatusChange={setStatus} />
      </>
    );
  };
  render(<Page />);

  fireEvent.change(screen.getByLabelText('New document'), { target: { files: [pdf('taxes.pdf')] } });
  expect(screen.getByText('taxes.pdf')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Close document' }));
  await waitFor(() => expect(screen.queryByText('taxes.pdf')).toBeNull());
  expect(screen.getByRole('button', { name: 'Close document' })).toBeDisabled();
});

test('shows the page count and a readable Document Information box', async () => {
  // jsdom's File may lack arrayBuffer(); pdf.js itself is mocked in setupTests (3 pages)
  if (!File.prototype.arrayBuffer) {
    File.prototype.arrayBuffer = function arrayBuffer() {
      return Promise.resolve(new ArrayBuffer(4));
    };
  }
  render(<SplitPdf />);
  choosePdf(pdf('wilfred_2024_tax_transcript.pdf'));

  expect(screen.getByText('wilfred_2024_tax_transcript.pdf')).toBeInTheDocument();
  expect(await screen.findByText('3', { selector: '.info-value' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('radio', { name: /Custom ranges/ }));
  expect(screen.getByText(/This PDF has 3 pages/)).toBeInTheDocument();
});

test('every page is previewed, and pages can be picked by clicking', async () => {
  const requests = mockSplitServer({ type: 'application/pdf', fileName: 'report_extracted.pdf' });
  render(<SplitPdf />);
  choosePdf();

  // The fake pdf.js has 3 pages
  const grid = await screen.findByRole('list', { name: 'Page previews' });
  expect(within(grid).getAllByRole('button', { name: /^Page \d$/ })).toHaveLength(3);
  expect(within(grid).getByText('File 3')).toBeInTheDocument(); // Every page: a file each

  // Clicking a page switches to picking pages to extract
  fireEvent.click(within(grid).getByRole('button', { name: 'Page 3' }));
  expect(screen.getByRole('radio', { name: /Extract pages/ })).toBeChecked();
  fireEvent.click(within(grid).getByRole('button', { name: 'Page 1' }));
  expect(screen.getByLabelText('Pages')).toHaveValue('1, 3');
  expect(within(grid).getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-pressed', 'false');

  // Typing updates the previews too
  fireEvent.change(screen.getByLabelText('Pages'), { target: { value: '1-2' } });
  expect(within(grid).getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-pressed', 'true');
  expect(within(grid).getByRole('button', { name: 'Page 3' })).toHaveAttribute('aria-pressed', 'false');

  fireEvent.click(splitButton());
  await screen.findByRole('status');
  expect(requests[0].form.get('ranges')).toBe('1-2');
});

test('custom ranges show which file each page goes into', async () => {
  mockSplitServer();
  render(<SplitPdf />);
  choosePdf();
  const grid = await screen.findByRole('list', { name: 'Page previews' });

  fireEvent.click(screen.getByRole('radio', { name: /Custom ranges/ }));
  fireEvent.change(screen.getByLabelText('Pages'), { target: { value: '1-2, 3' } });
  expect(within(within(grid).getByRole('button', { name: 'Page 2' })).getByText('File 1')).toBeInTheDocument();
  expect(within(within(grid).getByRole('button', { name: 'Page 3' })).getByText('File 2')).toBeInTheDocument();

  // Taking page 2 out keeps page 3 as its own file
  fireEvent.click(within(grid).getByRole('button', { name: 'Page 2' }));
  expect(screen.getByLabelText('Pages')).toHaveValue('1, 3');
});
