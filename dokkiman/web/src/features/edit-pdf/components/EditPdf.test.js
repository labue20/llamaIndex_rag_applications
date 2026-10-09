import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import EditPdf from './EditPdf';
import { mockFetch } from '../../../test-utils/mockFetch';

// The fake pdf.js (setupTests.js) opens every PDF with 3 pages of 600 x 800
const pdf = (name = 'lease.pdf') => {
  const file = new File(['%PDF'], name, { type: 'application/pdf' });
  file.arrayBuffer = () => Promise.resolve(new ArrayBuffer(4));
  return file;
};

const mockServer = (spec = { file: new Blob(['%PDF'], { type: 'application/pdf' }) }) =>
  mockFetch({ '/editPdf': spec });

const sentEdits = (fetchMock) => {
  const call = fetchMock.mock.calls.find(([url]) => url.endsWith('/editPdf'));
  return call && { edits: JSON.parse(call[1].body.get('edits')), body: call[1].body };
};

const openPdf = async () => {
  fireEvent.change(screen.getByLabelText('Choose File'), { target: { files: [pdf()] } });
  await screen.findByRole('toolbar', { name: 'Edit tools' });
  await screen.findByRole('button', { name: 'Page 3' });
};

const pages = () => within(screen.getByRole('list', { name: 'Pages' })).getAllByRole('button', { name: /^Page \d/ });
const done = (action) => {
  fireEvent.click(screen.getByRole('button', { name: /Done/ }));
  fireEvent.click(within(screen.getByRole('menu', { name: 'Done' })).getByRole('menuitem', { name: action }));
};
const save = () => done(/Download/);

// Drag on the page (the overlay is 600 x 800 on screen)
const dragOnPage = (from, to) => {
  const overlay = screen.getByTestId('edit-overlay');
  fireEvent.pointerDown(overlay, { clientX: from[0], clientY: from[1] });
  fireEvent.pointerMove(window, { clientX: to[0], clientY: to[1] });
  fireEvent.pointerUp(window, { clientX: to[0], clientY: to[1] });
};

beforeAll(() => {
  // jsdom has no PointerEvent; without one, pointer events lose their coordinates
  if (!window.PointerEvent) window.PointerEvent = class PointerEvent extends MouseEvent {};
});

beforeEach(() => {
  window.URL.createObjectURL = jest.fn(() => 'blob:fake');
  window.URL.revokeObjectURL = jest.fn();
  jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({ fillRect() {} }));
  jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    { left: 0, top: 0, width: 600, height: 800, right: 600, bottom: 800, x: 0, y: 0 }
  );
  jest.spyOn(console, 'error').mockImplementation(() => {});
  global.mockPdfAnnotations = undefined;
});

test('opens a PDF and shows its pages', async () => {
  render(<EditPdf />);
  await openPdf();
  expect(pages().map((p) => p.getAttribute('aria-label'))).toEqual(['Page 1', 'Page 2', 'Page 3']);
  expect(pages()[0]).toHaveAttribute('aria-current', 'page');
});

test('pages can be reordered, turned, copied and removed', async () => {
  const fetchMock = mockServer();
  render(<EditPdf />);
  await openPdf();

  fireEvent.click(screen.getByRole('button', { name: 'Move page 3 earlier' })); // 1 3 2
  fireEvent.click(screen.getByRole('button', { name: 'Turn page 1' }));
  fireEvent.click(screen.getByRole('button', { name: 'Copy page 2' })); // 1 3 3 2
  fireEvent.click(screen.getByRole('button', { name: 'Remove page 4' })); // 1 3 3
  fireEvent.click(screen.getByRole('button', { name: '+ Blank page' })); // a blank after the current page
  save();

  await screen.findByText(/Downloaded lease_edited.pdf/);
  expect(sentEdits(fetchMock).edits.pages).toEqual([
    { file: 0, page: 0, rotate: 90 },
    { file: 0, page: 2, rotate: 0 },
    { file: 0, page: 2, rotate: 0 },
    { blank: true, rotate: 0 },
  ]);
});

test('text is placed where the page is clicked, then typed', async () => {
  const fetchMock = mockServer();
  render(<EditPdf />);
  await openPdf();

  fireEvent.click(screen.getByRole('button', { name: 'Add text' }));
  dragOnPage([60, 400], [60, 400]); // a click
  fireEvent.change(await screen.findByRole('textbox', { name: 'Text' }), { target: { value: 'Paid in full' } });
  fireEvent.change(screen.getByRole('combobox', { name: /Size/ }), { target: { value: '18' } });
  fireEvent.click(screen.getByRole('button', { name: 'Color #dc2626' }));
  save();

  await screen.findByText(/Downloaded/);
  const [item] = sentEdits(fetchMock).edits.items;
  expect(item).toMatchObject({ kind: 'text', page: 0, text: 'Paid in full', x: 0.1, color: '#dc2626', bold: false });
  expect(item.font_size).toBeCloseTo(18 / 792);
  expect(item.y).toBeCloseTo(0.5 - 0.045 / 2);
});

test('highlights, boxes, white-out and drawings follow the drag', async () => {
  const fetchMock = mockServer();
  render(<EditPdf />);
  await openPdf();

  fireEvent.click(screen.getByRole('button', { name: 'Highlight' }));
  dragOnPage([60, 80], [300, 120]);
  fireEvent.click(screen.getByRole('button', { name: 'White-out' }));
  dragOnPage([0, 0], [600, 80]);
  fireEvent.click(screen.getByRole('button', { name: 'Draw' }));
  dragOnPage([60, 600], [540, 600]);
  fireEvent.click(pages()[1]); // things on page 2 go with page 2
  fireEvent.click(screen.getByRole('button', { name: 'Shapes' })); // a box, to start with
  dragOnPage([300, 400], [120, 200]); // dragged up and left
  save();

  await screen.findByText(/Downloaded/);
  const { items } = sentEdits(fetchMock).edits;
  expect(items.map((i) => [i.kind, i.page])).toEqual([['highlight', 0], ['whiteout', 0], ['draw', 0], ['rect', 1]]);
  expect(items[0]).toMatchObject({ x: 0.1, y: 0.1, width: 0.4, color: '#fde047' });
  expect(items[0].height).toBeCloseTo(0.05);
  expect(items[1].color).toBeUndefined();
  expect(items[2].points).toEqual([[0.1, 0.75], [0.9, 0.75]]);
  expect(items[3]).toMatchObject({ x: 0.2, y: 0.25, width: 0.3, height: 0.25 });
});

test('undo takes back the last change', async () => {
  const fetchMock = mockServer();
  render(<EditPdf />);
  await openPdf();

  fireEvent.click(screen.getByRole('button', { name: 'Highlight' }));
  dragOnPage([60, 80], [300, 120]);
  fireEvent.click(screen.getByRole('button', { name: 'Remove page 2' }));
  expect(pages()).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(pages()).toHaveLength(3);
  fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
  save();

  await screen.findByText(/Downloaded/);
  expect(sentEdits(fetchMock).edits.items).toEqual([]);
});

test('removing a page removes what was added to it', async () => {
  const fetchMock = mockServer();
  render(<EditPdf />);
  await openPdf();
  fireEvent.click(screen.getByRole('button', { name: 'Highlight' }));
  dragOnPage([60, 80], [300, 120]);
  fireEvent.click(screen.getByRole('button', { name: 'Remove page 1' }));
  save();
  await screen.findByText(/Downloaded/);
  expect(sentEdits(fetchMock).edits.items).toEqual([]);
  expect(sentEdits(fetchMock).edits.pages).toHaveLength(2);
});

test('images are uploaded with the edits', async () => {
  const fetchMock = mockServer();
  render(<EditPdf />);
  await openPdf();
  const logo = new File(['png'], 'logo.png', { type: 'image/png' });
  fireEvent.change(screen.getByLabelText('Add an image'), { target: { files: [logo] } });
  await screen.findByRole('button', { name: 'image' }, { timeout: 3000 });
  save();

  await screen.findByText(/Downloaded/);
  const { edits, body } = sentEdits(fetchMock);
  expect(edits.items).toEqual([expect.objectContaining({ kind: 'image', page: 0, image: 0 })]);
  expect(body.getAll('images')).toHaveLength(1);
  expect(body.getAll('images')[0].name).toBe('logo.png');
});

test('other PDFs can be added to combine them', async () => {
  const fetchMock = mockServer();
  render(<EditPdf />);
  await openPdf();
  fireEvent.change(screen.getByLabelText('Add files'), { target: { files: [pdf('appendix.pdf')] } });
  await waitFor(() => expect(pages()).toHaveLength(6));
  expect(screen.getAllByText(/PDF 2/)).toHaveLength(3);
  save();

  await screen.findByText(/Downloaded/);
  const { edits, body } = sentEdits(fetchMock);
  expect(edits.pages.slice(3)).toEqual([0, 1, 2].map((page) => ({ file: 1, page, rotate: 0 })));
  expect(body.getAll('files').map((f) => f.name)).toEqual(['appendix.pdf']);
});

test('the PDF’s form fields can be filled in', async () => {
  global.mockPdfAnnotations = [
    { id: '1R', subtype: 'Widget', fieldName: 'tenant', fieldType: 'Tx', rect: [60, 700, 360, 720], fieldValue: '' },
    { id: '2R', subtype: 'Widget', fieldName: 'pets', fieldType: 'Btn', checkBox: true, exportValue: 'Yes',
      rect: [60, 600, 80, 620], fieldValue: 'Off' },
  ];
  const fetchMock = mockServer();
  render(<EditPdf />);
  await openPdf();

  fireEvent.change(await screen.findByRole('textbox', { name: 'Form field tenant' }), { target: { value: 'Jordan Avery' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Form field pets' }));
  save();

  await screen.findByText(/Downloaded/);
  expect(sentEdits(fetchMock).edits.form).toEqual({ tenant: 'Jordan Avery', pets: true });
});

test('problems from the server are shown', async () => {
  mockServer({ status: 400, body: { error: 'A page doesn’t exist in its PDF.' } });
  render(<EditPdf />);
  await openPdf();
  save();
  expect(await screen.findByRole('alert')).toHaveTextContent('A page doesn’t exist in its PDF.');
});

test('the PDF’s own text can be changed, line by line', async () => {
  const line = { x: 0.1, y: 0.2, width: 0.4, height: 0.02, text: 'Monthly rent is $1,700', font: 'serif', bold: false,
    italic: false, color: '#cc0000', font_size: 0.015 };
  const fetchMock = mockFetch({
    '/pdfText': { body: { pages: [[line, { ...line, y: 0.3, text: 'Due on the first' }], [], []] } },
    '/editPdf': { file: new Blob(['%PDF'], { type: 'application/pdf' }) },
  });
  render(<EditPdf />);
  await openPdf();

  fireEvent.click(screen.getByRole('button', { name: 'Edit text' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Edit text: Monthly rent is $1,700' }));
  const box = screen.getByRole('textbox', { name: 'Text' });
  expect(box).toHaveValue('Monthly rent is $1,700');
  fireEvent.change(box, { target: { value: 'Monthly rent is $1,850' } });
  // An edited line can't be picked again; the others can
  expect(screen.queryByRole('button', { name: 'Edit text: Monthly rent is $1,700' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Edit text: Due on the first' }));
  fireEvent.change(screen.getAllByRole('textbox', { name: 'Text' })[0], { target: { value: '' } }); // delete the line
  save();

  await screen.findByText(/Downloaded/);
  const { items } = sentEdits(fetchMock).edits;
  expect(items).toEqual([
    { kind: 'erase', page: 0, x: 0.1, y: 0.2, width: 0.4, height: 0.02 },
    expect.objectContaining({ kind: 'text', page: 0, text: 'Monthly rent is $1,850', font: 'serif', color: '#cc0000',
      font_size: 0.015, x: 0.1, y: 0.2 }),
    { kind: 'erase', page: 0, x: 0.1, y: 0.3, width: 0.4, height: 0.02 },
  ]);
  // The PDF went to /pdfText once
  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/pdfText'))).toHaveLength(1);
});

test('text can be styled', async () => {
  const fetchMock = mockServer();
  render(<EditPdf />);
  await openPdf();
  fireEvent.click(screen.getByRole('button', { name: 'Add text' }));
  dragOnPage([60, 400], [60, 400]);
  fireEvent.change(await screen.findByRole('textbox', { name: 'Text' }), { target: { value: 'Note' } });
  fireEvent.change(screen.getByRole('combobox', { name: /Font/ }), { target: { value: 'mono' } });
  fireEvent.click(screen.getByRole('button', { name: 'Italic' }));
  fireEvent.click(screen.getByRole('button', { name: 'Underline' }));
  fireEvent.click(screen.getByRole('button', { name: 'Align center' }));
  save();

  await screen.findByText(/Downloaded/);
  expect(sentEdits(fetchMock).edits.items[0]).toMatchObject({
    kind: 'text', text: 'Note', font: 'mono', italic: true, underline: true, align: 'center', bold: false,
  });
});

test('shapes, arrows, marks and redactions', async () => {
  const fetchMock = mockServer();
  render(<EditPdf />);
  await openPdf();

  fireEvent.click(screen.getByRole('button', { name: 'Shapes' }));
  fireEvent.click(screen.getByRole('button', { name: 'Ellipse' }));
  dragOnPage([60, 80], [300, 160]);
  fireEvent.click(screen.getByRole('button', { name: 'Shapes' }));
  fireEvent.click(screen.getByRole('button', { name: 'Arrow' }));
  dragOnPage([60, 400], [300, 400]);
  fireEvent.click(screen.getByRole('button', { name: 'Marks' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cross' }));
  dragOnPage([300, 600], [300, 600]); // a click
  fireEvent.click(screen.getByRole('button', { name: 'Redact' }));
  dragOnPage([60, 700], [360, 720]);
  save();

  await screen.findByText(/Downloaded/);
  const { items } = sentEdits(fetchMock).edits;
  expect(items.map((i) => i.kind)).toEqual(['ellipse', 'line', 'mark', 'redact']);
  expect(items[1]).toMatchObject({ arrow: true, points: [[0.1, 0.5], [0.5, 0.5]] });
  expect(items[2]).toMatchObject({ mark: 'cross', color: '#16a34a', width: 0.035 });
  // Marks are square on the page: 0.035 of the width is 0.02625 of the (taller) height
  expect(items[2].height).toBeCloseTo(0.02625);
  expect(items[3].color).toBeUndefined();
});

test('the date can be added from Sign', async () => {
  const fetchMock = mockServer();
  render(<EditPdf />);
  await openPdf();
  fireEvent.click(screen.getByRole('button', { name: 'Sign' }));
  fireEvent.click(screen.getByRole('button', { name: 'Date' }));
  save();
  await screen.findByText(/Downloaded/);
  expect(sentEdits(fetchMock).edits.items[0]).toMatchObject({ kind: 'text', text: new Date().toLocaleDateString() });
});

test('redo puts back what undo took away', async () => {
  const fetchMock = mockServer();
  render(<EditPdf />);
  await openPdf();
  fireEvent.click(screen.getByRole('button', { name: 'Highlight' }));
  dragOnPage([60, 80], [300, 120]);
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(screen.getByRole('button', { name: 'Redo' })).toBeEnabled();
  fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true });
  expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
  save();
  await screen.findByText(/Downloaded/);
  expect(sentEdits(fetchMock).edits.items.map((i) => i.kind)).toEqual(['highlight']);
});

test('sticky notes', async () => {
  const fetchMock = mockServer();
  render(<EditPdf />);
  await openPdf();
  fireEvent.click(screen.getByRole('button', { name: 'Note' }));
  dragOnPage([300, 400], [300, 400]);
  fireEvent.change(await screen.findByRole('textbox', { name: 'Note' }), { target: { value: 'Ask about parking' } });
  save();
  await screen.findByText(/Downloaded/);
  expect(sentEdits(fetchMock).edits.items).toEqual([
    expect.objectContaining({ kind: 'note', page: 0, text: 'Ask about parking', color: '#f59e0b', width: 0.03 }),
  ]);
});

test('a watermark and page numbers are previewed and sent with the edits', async () => {
  const fetchMock = mockServer();
  render(<EditPdf />);
  await openPdf();
  fireEvent.click(screen.getByRole('button', { name: 'Watermark' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Watermark text' }), { target: { value: 'DRAFT' } });
  fireEvent.click(screen.getByRole('button', { name: 'Page numbers' }));
  fireEvent.change(screen.getByRole('combobox', { name: /Style/ }), { target: { value: 'page_n_of' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Not on the first page' }));
  // Page 1 isn't numbered; page 2 is "Page 1 of 2"
  expect(screen.getByText('DRAFT')).toBeInTheDocument();
  expect(screen.queryByLabelText(/Page number:/)).not.toBeInTheDocument();
  fireEvent.click(pages()[1]);
  expect(await screen.findByLabelText('Page number: Page 1 of 2')).toBeInTheDocument();
  save();

  await screen.findByText(/Downloaded/);
  expect(sentEdits(fetchMock).edits.options).toEqual({
    watermark: { text: 'DRAFT', color: '#dc2626', opacity: 0.25, size: 0.1, diagonal: true },
    page_numbers: { format: 'page_n_of', position: 'bottom-center', start: 1, skip_first: true, size: 10 },
  });
});

test('Word documents and images are opened as PDFs', async () => {
  const fetchMock = mockFetch({ '/toPdf': { file: new Blob(['%PDF'], { type: 'application/pdf' }) } });
  render(<EditPdf />);
  const word = new File(['docx'], 'letter.docx');
  fireEvent.change(screen.getByLabelText('Choose File'), { target: { files: [word] } });
  await screen.findByRole('button', { name: 'Page 3' });
  const call = fetchMock.mock.calls.find(([url]) => url.endsWith('/toPdf'));
  expect(call[1].body.get('file').name).toBe('letter.docx');
});

test('other files can’t be opened', async () => {
  mockFetch({});
  render(<EditPdf />);
  fireEvent.change(screen.getByLabelText('Choose File'), { target: { files: [new File(['x'], 'notes.txt')] } });
  expect(await screen.findByRole('alert')).toHaveTextContent('Open a PDF, a Word document');
});

test('Done: download, send for signature, or keep it in the Document Manager; the PDF is made once', async () => {
  const fetchMock = mockServer();
  const onSend = jest.fn();
  const onKeep = jest.fn(() => Promise.resolve());
  render(<EditPdf onSendForSignature={onSend} onSaveToDocuments={onKeep} />);
  await openPdf();

  done(/Save to Document Manager/);
  expect(await screen.findByRole('status')).toHaveTextContent('Saved lease_edited.pdf to your Document Manager.');
  expect(onKeep.mock.calls[0][0].name).toBe('lease_edited.pdf');
  expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: /Done/ }));
  expect(screen.getByRole('menuitem', { name: /Saved to Document Manager/ })).toBeDisabled();
  fireEvent.click(screen.getByRole('menuitem', { name: /Send for signature/ }));
  await waitFor(() => expect(onSend).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'lease_edited.pdf', type: 'application/pdf' })
  ));
  // Nothing changed in between, so the server made the PDF once
  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/editPdf'))).toHaveLength(1);

  // After a change, Done makes it again
  fireEvent.click(screen.getByRole('button', { name: 'Turn page 1' }));
  save();
  await screen.findByText(/Downloaded/);
  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/editPdf'))).toHaveLength(2);
});

test('guests can download, and are asked to sign up to keep or send their PDF', async () => {
  mockServer();
  render(<EditPdf />);
  await openPdf();
  fireEvent.click(screen.getByRole('button', { name: /Done/ }));
  const menu = screen.getByRole('menu', { name: 'Done' });
  expect(within(menu).getByText(/Create a free account to keep your PDFs/)).toBeInTheDocument();
  expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
    'DownloadSave the PDF to this device',
  ]);
});

test('the editor fills the window; closing asks first when there are unsaved changes', async () => {
  mockServer();
  render(<EditPdf />);
  await openPdf();
  expect(screen.getByRole('region', { name: 'PDF editor' })).toHaveClass('edit-pdf--fullscreen');
  expect(screen.getByText('lease.pdf')).toBeInTheDocument();
  expect(screen.getByText('3 pages')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Turn page 1' }));
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
  fireEvent.click(screen.getByRole('button', { name: 'Close editor' }));
  expect(confirm).toHaveBeenCalledWith('Close without saving? Your changes will be lost.');
  expect(screen.getByRole('region', { name: 'PDF editor' })).toBeInTheDocument();

  // Once downloaded, it closes straight away
  save();
  await screen.findByText(/Downloaded/);
  confirm.mockClear();
  fireEvent.click(screen.getByRole('button', { name: 'Close editor' }));
  expect(confirm).not.toHaveBeenCalled();
  expect(screen.queryByRole('region', { name: 'PDF editor' })).not.toBeInTheDocument();
  expect(screen.getByLabelText('Choose File')).toBeInTheDocument();
});

test('pages and zoom from the floating bar', async () => {
  render(<EditPdf />);
  await openPdf();
  const nav = screen.getByRole('group', { name: 'Page and zoom' });
  expect(within(nav).getByText('1 / 3')).toBeInTheDocument();
  expect(within(nav).getByRole('button', { name: 'Previous page' })).toBeDisabled();

  fireEvent.click(within(nav).getByRole('button', { name: 'Next page' }));
  expect(within(nav).getByText('2 / 3')).toBeInTheDocument();
  expect(pages()[1]).toHaveAttribute('aria-current', 'page');

  // Zoom steps from the fitted size; Fit goes back
  expect(within(nav).getByRole('button', { name: 'Fit to width' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(within(nav).getByRole('button', { name: 'Zoom in' }));
  expect(within(nav).getByRole('button', { name: 'Fit to width' })).toHaveAttribute('aria-pressed', 'false');
  const zoomed = within(nav).getByLabelText('Zoom').textContent;
  expect(['25%', '50%', '75%', '100%', '125%', '150%', '200%', '300%']).toContain(zoomed);
  fireEvent.click(within(nav).getByRole('button', { name: 'Fit to width' }));
  expect(within(nav).getByRole('button', { name: 'Fit to width' })).toHaveAttribute('aria-pressed', 'true');
});

test('Watermark and Page numbers in the tools turn them on and open their settings', async () => {
  render(<EditPdf />);
  await openPdf();
  expect(screen.queryByRole('complementary', { name: 'Watermark and page numbers' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Watermark' }));
  const panel = screen.getByRole('complementary', { name: 'Watermark and page numbers' });
  expect(within(panel).getByRole('checkbox', { name: 'Watermark' })).toBeChecked();
  expect(within(panel).getByRole('checkbox', { name: 'Page numbers' })).not.toBeChecked();
  fireEvent.click(within(panel).getByRole('button', { name: 'Close watermark and page numbers' }));
  expect(screen.queryByRole('complementary', { name: 'Watermark and page numbers' })).not.toBeInTheDocument();
});
