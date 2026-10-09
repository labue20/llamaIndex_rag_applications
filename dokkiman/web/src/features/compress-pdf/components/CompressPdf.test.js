import { fireEvent, render, screen } from '@testing-library/react';
import CompressPdf, { formatSize } from './CompressPdf';

const MB = 1024 * 1024;
const pdf = (size = 4 * MB, name = 'scan.pdf') => new File([new Uint8Array(size)], name, { type: 'application/pdf' });

// Fake /compressPdf: records the form it receives and answers with a file of the given size, or an error
const mockCompressServer = ({ status = 200, size = MB, error } = {}) => {
  const requests = [];
  global.fetch = jest.fn((url, options) => {
    requests.push({ url, form: options.body });
    if (status !== 200) {
      return Promise.resolve({ ok: false, status, json: () => Promise.resolve({ error }) });
    }
    return Promise.resolve({
      ok: true,
      status,
      blob: () => Promise.resolve(new Blob([new Uint8Array(size)], { type: 'application/pdf' })),
      headers: { get: (name) => (name === 'Content-Disposition' ? 'attachment; filename=scan_compressed.pdf' : null) },
    });
  });
  return requests;
};

const choosePdf = (file = pdf()) =>
  fireEvent.change(screen.getByLabelText('Choose PDF File'), { target: { files: [file] } });

const compressButton = () => screen.getByRole('button', { name: /Compress PDF/ });

beforeEach(() => {
  window.URL.createObjectURL = jest.fn(() => 'blob:fake');
  window.URL.revokeObjectURL = jest.fn();
  jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

test('compresses at the recommended level and shows the size before and after', async () => {
  const requests = mockCompressServer({ size: MB });
  render(<CompressPdf />);
  choosePdf();

  expect(screen.getByText('4.0 MB')).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: /Recommended/ })).toBeChecked();
  fireEvent.click(compressButton());

  expect(await screen.findByRole('status'))
    .toHaveTextContent('Downloaded scan_compressed.pdf: 4.0 MB → 1.0 MB (75% smaller)');
  expect(requests[0].url).toMatch(/\/compressPdf$/);
  expect(requests[0].form.get('level')).toBe('recommended');
  expect(requests[0].form.get('file').name).toBe('scan.pdf');
  expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
});

test('sends the chosen level', async () => {
  const requests = mockCompressServer();
  render(<CompressPdf />);
  choosePdf();

  fireEvent.click(screen.getByRole('radio', { name: /Strong/ }));
  fireEvent.click(compressButton());

  await screen.findByRole('status');
  expect(requests[0].form.get('level')).toBe('strong');
});

test('a PDF that can’t shrink isn’t downloaded again', async () => {
  mockCompressServer({ size: 4 * MB });
  render(<CompressPdf />);
  choosePdf();
  fireEvent.click(compressButton());

  expect(await screen.findByRole('status')).toHaveTextContent('already as small as it gets. Try Strong');
  expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
});

test('shows the server’s error', async () => {
  mockCompressServer({ status: 400, error: 'Password-protected PDFs can’t be compressed.' });
  render(<CompressPdf />);
  choosePdf();
  fireEvent.click(compressButton());

  expect(await screen.findByRole('alert')).toHaveTextContent('Password-protected PDFs can’t be compressed.');
});

test('formats sizes', () => {
  expect(formatSize(300)).toBe('1 KB');
  expect(formatSize(512 * 1024)).toBe('512 KB');
  expect(formatSize(25.14 * MB)).toBe('25.1 MB');
});
