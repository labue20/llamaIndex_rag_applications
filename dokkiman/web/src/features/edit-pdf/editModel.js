/**
 * Edit PDF: the pieces that don't need the screen
 *
 * Pages: { key, file (0 = the main PDF, 1.. = PDFs added to it), page (index in
 * that PDF), rotate (0/90/180/270, added to the page's own), blank, width and
 * height (the page as its PDF shows it, before our rotation) }.
 * Items are tied to a page by its key, so they follow it when pages move.
 * Positions are fractions (0..1) of the page as shown, as the server expects.
 */

export const TOOLS = [
  { id: 'select', label: 'Select', icon: 'pointer' },
  { id: 'edittext', label: 'Edit text', icon: 'textCursor' },
  { id: 'text', label: 'Add text', icon: 'type' },
  { id: 'sign', label: 'Sign', icon: 'pen' },
  { id: 'shapes', label: 'Shapes', icon: 'shapes' },
  { id: 'marks', label: 'Marks', icon: 'marks' },
  { id: 'note', label: 'Note', icon: 'note' },
  { id: 'highlight', label: 'Highlight', icon: 'highlighter' },
  { id: 'draw', label: 'Draw', icon: 'draw' },
  { id: 'whiteout', label: 'White-out', icon: 'eraser' },
  { id: 'redact', label: 'Redact', icon: 'redact' },
];

// Shapes and marks: the kind of thing each choice adds
export const SHAPES = [
  { id: 'rect', label: 'Box', kind: 'rect' },
  { id: 'ellipse', label: 'Ellipse', kind: 'ellipse' },
  { id: 'line', label: 'Line', kind: 'line' },
  { id: 'arrow', label: 'Arrow', kind: 'line', arrow: true },
];
export const MARKS = [
  { id: 'check', label: 'Check', symbol: '✓' },
  { id: 'cross', label: 'Cross', symbol: '✗' },
  { id: 'circle', label: 'Circle', symbol: '○' },
  { id: 'dot', label: 'Dot', symbol: '•' },
];
export const FONTS = [
  { id: 'sans', label: 'Sans', css: 'Helvetica, Arial, sans-serif' },
  { id: 'serif', label: 'Serif', css: '"Times New Roman", Times, Georgia, serif' },
  { id: 'mono', label: 'Mono', css: '"Courier New", Courier, monospace' },
];
export const fontCss = (id) => (FONTS.find((f) => f.id === id) || FONTS[0]).css;

export const COLORS = ['#111827', '#2563eb', '#dc2626', '#16a34a', '#f59e0b', '#fde047', '#ffffff'];
// Colors are remembered per kind of thing added
export const DEFAULT_COLORS = {
  text: '#111827', highlight: '#fde047', rect: '#dc2626', ellipse: '#dc2626', line: '#dc2626', draw: '#2563eb',
  mark: '#16a34a', note: '#f59e0b',
};

// Whole-document options: a watermark and page numbers
export const DEFAULT_OPTIONS = {
  watermark: { enabled: false, text: 'CONFIDENTIAL', color: '#dc2626', opacity: 0.25, size: 0.1, diagonal: true },
  page_numbers: { enabled: false, format: 'n', position: 'bottom-center', start: 1, skip_first: false, size: 10 },
};
export const NUMBER_FORMATS = [
  { id: 'n', label: '1', make: (n) => `${n}` },
  { id: 'page_n', label: 'Page 1', make: (n) => `Page ${n}` },
  { id: 'page_n_of', label: 'Page 1 of 9', make: (n, total) => `Page ${n} of ${total}` },
  { id: 'n_of', label: '1 / 9', make: (n, total) => `${n} / ${total}` },
];
export const NUMBER_POSITIONS = [
  { id: 'bottom-center', label: 'Bottom center' },
  { id: 'bottom-right', label: 'Bottom right' },
  { id: 'bottom-left', label: 'Bottom left' },
  { id: 'top-center', label: 'Top center' },
  { id: 'top-right', label: 'Top right' },
  { id: 'top-left', label: 'Top left' },
];

/** The page number shown on the page at this position (or null: not numbered). */
export const pageNumberLabel = (numbers, index, pageCount) => {
  if (!numbers?.enabled) return null;
  const first = numbers.skip_first ? 1 : 0;
  if (index < first) return null;
  const start = Math.max(1, Number(numbers.start) || 1);
  const format = NUMBER_FORMATS.find((f) => f.id === numbers.format) || NUMBER_FORMATS[0];
  return format.make(index - first + start, pageCount - first + start - 1);
};

/** The options as /editPdf expects them: only the ones switched on. */
export const optionsForServer = (options) => {
  const out = {};
  if (options.watermark.enabled && options.watermark.text.trim()) {
    const { enabled, ...watermark } = options.watermark;
    out.watermark = watermark;
  }
  if (options.page_numbers.enabled) {
    const { enabled, ...numbers } = options.page_numbers;
    out.page_numbers = { ...numbers, start: Math.max(1, Number(numbers.start) || 1) };
  }
  return out;
};
// Font sizes in points, stored as a fraction of the page height (an 11-inch page is 792 points)
export const FONT_SIZES = [8, 10, 12, 14, 18, 24, 32, 48];
export const POINTS_PER_PAGE = 792;
export const STROKES = [
  { label: 'Thin', value: 0.002 },
  { label: 'Medium', value: 0.004 },
  { label: 'Thick', value: 0.008 },
];
export const MAX_FILES = 10;

let nextKey = 1;
export const newKey = () => `k${nextKey++}`;

export const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/** The page's size as shown, with our rotation applied. */
export const shownSize = (page) =>
  page.rotate % 180 === 0 ? { width: page.width, height: page.height } : { width: page.height, height: page.width };

export const rotateBy = (rotate, turn) => (((rotate + turn) % 360) + 360) % 360;

/**
 * What /editPdf expects: pages in order, items on them, and the form values
 * that changed. An edited line of the PDF's own text becomes two items: erase
 * the old line, then the new text (left out if it was emptied: the line is
 * deleted).
 */
export const buildEdits = (pages, items, formValues, imageIndex, options = DEFAULT_OPTIONS) => {
  const position = new Map(pages.map((page, index) => [page.key, index]));
  const out = [];
  items.filter((item) => position.has(item.pageKey)).forEach(({ id, pageKey, imageId, replaces, lineKey, ...rest }) => {
    const page = position.get(pageKey);
    if (replaces) out.push({ kind: 'erase', page, ...replaces });
    if ((rest.kind === 'text' || rest.kind === 'note') && !rest.text.trim()) return;
    out.push({ ...rest, page, ...(rest.kind === 'image' ? { image: imageIndex(imageId) } : {}) });
  });
  return {
    pages: pages.map((page) => (page.blank
      ? { blank: true, rotate: page.rotate }
      : { file: page.file, page: page.page, rotate: page.rotate })),
    items: out,
    form: formValues,
    options: optionsForServer(options),
  };
};

/** A line of the PDF's own text (from /pdfText) as an editable text box over it. */
export const textItemForLine = (line, lineKey) => ({
  kind: 'text',
  text: line.text,
  font: line.font,
  bold: line.bold,
  italic: line.italic,
  underline: false,
  align: 'left',
  color: line.color,
  font_size: line.font_size,
  x: line.x,
  y: line.y,
  // A little room to grow, so a slightly longer line doesn't have to shrink
  width: Math.min(1 - line.x, line.width * 1.25 + 0.03),
  height: Math.min(1 - line.y, line.height * 1.35),
  replaces: { x: line.x, y: line.y, width: line.width, height: line.height },
  lineKey,
});

/** pdf.js annotations -> the form fields we can fill: name, type, place on the page, options. */
export const formFieldsFrom = (annotations, viewport) => annotations
  .filter((a) => a.subtype === 'Widget' && a.fieldName && !a.readOnly && !a.pushButton && !a.hidden)
  .map((a) => {
    const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(a.rect);
    const box = {
      x: Math.min(x1, x2) / viewport.width,
      y: Math.min(y1, y2) / viewport.height,
      width: Math.abs(x2 - x1) / viewport.width,
      height: Math.abs(y2 - y1) / viewport.height,
    };
    let type = 'text';
    if (a.fieldType === 'Btn') type = a.radioButton ? 'radio' : 'checkbox';
    else if (a.fieldType === 'Ch') type = 'choice';
    else if (a.fieldType !== 'Tx') return null;
    return {
      id: a.id,
      name: a.fieldName,
      type,
      ...box,
      multiline: !!a.multiLine,
      options: (a.options || []).map((o) => ({ value: o.exportValue, label: o.displayValue ?? o.exportValue })),
      // Radio buttons share a name; this is the value that turns this one on
      onValue: a.buttonValue ?? a.exportValue,
      initial: a.fieldValue,
    };
  })
  .filter(Boolean);

/** A field's current value: what the person typed, or what the PDF had. */
export const fieldValue = (field, formValues) => {
  if (field.name in formValues) return formValues[field.name];
  if (field.type === 'checkbox') return !!field.initial && field.initial !== 'Off';
  if (field.type === 'radio') return field.initial ?? '';
  return field.initial ?? '';
};
