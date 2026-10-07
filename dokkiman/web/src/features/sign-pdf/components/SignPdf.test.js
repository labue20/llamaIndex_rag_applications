import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SignPdf from './SignPdf';

const pdf = (name = 'lease.pdf') => {
  const file = new File(['%PDF'], name, { type: 'application/pdf' });
  file.arrayBuffer = () => Promise.resolve(new ArrayBuffer(4));
  return file;
};

// Fake /signPdf (and data: URLs, which the page fetches to turn signatures into blobs)
const mockSignServer = ({ status = 200, error } = {}) => {
  const requests = [];
  global.fetch = jest.fn((url, options) => {
    if (String(url).startsWith('data:')) {
      return Promise.resolve({ blob: () => Promise.resolve(new Blob(['png'], { type: 'image/png' })) });
    }
    requests.push({ url, form: options.body });
    if (status !== 200) {
      return Promise.resolve({ ok: false, status, json: () => Promise.resolve({ error }) });
    }
    const headers = {
      'Content-Disposition': 'attachment; filename=lease_signed.pdf',
      'X-Document-SHA256': 'ab'.repeat(32),
      'X-Audit-Record-Id': '0123456789abcdef',
    };
    return Promise.resolve({
      ok: true,
      status,
      blob: () => Promise.resolve(new Blob(['%PDF'], { type: 'application/pdf' })),
      headers: { get: (name) => headers[name] ?? null },
    });
  });
  return requests;
};

// jsdom has no canvas; give typed signatures something to draw on
const mockCanvas = () => {
  const data = new Uint8ClampedArray(4 * 1200 * 240);
  data[(100 * 1200 + 50) * 4 + 3] = 255; // one inked pixel
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function getContext() {
    const { width, height } = this;
    return {
      scale() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, clearRect() {},
      fillText() {}, drawImage() {},
      getImageData: () => ({ data: width === 1200 && height === 240 ? data : new Uint8ClampedArray(4 * width * height) }),
    };
  });
  jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');
};

const openPdf = async () => {
  fireEvent.change(screen.getByLabelText('Choose PDF File'), { target: { files: [pdf()] } });
  await screen.findByRole('toolbar', { name: 'Add to document' });
};

const signButton = () => screen.getByRole('button', { name: /Sign & download/ });

beforeEach(() => {
  window.URL.createObjectURL = jest.fn(() => 'blob:fake');
  window.URL.revokeObjectURL = jest.fn();
  jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockCanvas();
});

test('asks for something to place before signing', async () => {
  const requests = mockSignServer();
  render(<SignPdf />);
  await openPdf();

  fireEvent.click(signButton());
  expect(screen.getByRole('alert')).toHaveTextContent('Add a signature, initials or date');
  expect(requests).toHaveLength(0);
});

test('places a date and signs with the audit trail', async () => {
  const requests = mockSignServer();
  render(<SignPdf />);
  await openPdf();

  fireEvent.click(screen.getByRole('button', { name: /Date/ }));
  expect(screen.getByRole('button', { name: 'date on page 1' })).toBeInTheDocument();
  fireEvent.click(signButton());

  const status = await screen.findByRole('status');
  expect(status).toHaveTextContent('Signed and downloaded lease_signed.pdf');
  expect(status).toHaveTextContent('Audit record 01234567');

  const { url, form } = requests[0];
  expect(url).toMatch(/\/signPdf$/);
  expect(form.get('file').name).toBe('lease.pdf');
  expect(form.get('audit')).toBe('true');
  expect(form.getAll('images')).toHaveLength(0);
  const [placement] = JSON.parse(form.get('placements'));
  expect(placement).toMatchObject({ type: 'text', page: 0, label: 'date', text: new Date().toLocaleDateString() });
});

test('the audit trail can be turned off', async () => {
  const requests = mockSignServer();
  render(<SignPdf />);
  await openPdf();

  fireEvent.click(screen.getByRole('button', { name: /Date/ }));
  fireEvent.click(screen.getByRole('checkbox', { name: /audit trail/ }));
  fireEvent.click(signButton());

  await screen.findByRole('status');
  expect(requests[0].form.get('audit')).toBe('false');
});

test('a typed signature is sent as an image and linked from its placement', async () => {
  const requests = mockSignServer();
  render(<SignPdf />);
  await openPdf();

  fireEvent.click(screen.getByRole('button', { name: /Signature/ }));
  const dialog = screen.getByRole('dialog', { name: 'Create your signature' });
  expect(screen.getByRole('button', { name: 'Add signature' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Your full name'), { target: { value: 'Jane Smith' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add signature' }));

  await waitFor(() => expect(dialog).not.toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'signature on page 1' })).toBeInTheDocument();

  // A second date item, so the image index has to pick the right image
  fireEvent.click(screen.getByRole('button', { name: /Date/ }));
  fireEvent.click(signButton());
  await screen.findByRole('status');

  const form = requests[0].form;
  expect(form.getAll('images')).toHaveLength(1);
  const placements = JSON.parse(form.get('placements'));
  expect(placements.map((p) => p.type)).toEqual(['image', 'text']);
  expect(placements[0]).toMatchObject({ page: 0, label: 'signature', image: 0 });
  expect(placements[0].x + placements[0].width).toBeLessThanOrEqual(1);
});

test('selected items move with the arrow keys and are removed with Delete', async () => {
  render(<SignPdf />);
  await openPdf();

  fireEvent.click(screen.getByRole('button', { name: /Date/ }));
  const item = screen.getByRole('button', { name: 'date on page 1' });
  const left = parseFloat(item.style.left);
  fireEvent.keyDown(item, { key: 'ArrowRight' });
  expect(parseFloat(item.style.left)).toBeCloseTo(left + 1);

  fireEvent.keyDown(item, { key: 'Delete' });
  expect(screen.queryByRole('button', { name: 'date on page 1' })).toBeNull();
});

test('items stay on the page they were added to', async () => {
  render(<SignPdf />);
  await openPdf();

  fireEvent.click(screen.getByRole('button', { name: /Next/ }));
  expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Date/ }));
  expect(screen.getByRole('button', { name: 'date on page 2' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /Previous/ }));
  expect(screen.queryByRole('button', { name: 'date on page 2' })).toBeNull();
});

test('shows the server error when signing fails', async () => {
  mockSignServer({ status: 400, error: 'Password-protected PDFs can’t be signed.' });
  render(<SignPdf />);
  await openPdf();

  fireEvent.click(screen.getByRole('button', { name: /Date/ }));
  fireEvent.click(signButton());
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Password-protected'));
});

test('guests do not see the Document Manager picker', async () => {
  render(<SignPdf allowDocumentManager={false} />);
  expect(screen.queryByRole('button', { name: /Document Manager/ })).toBeNull();
});
