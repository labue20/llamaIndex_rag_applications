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
  { id: 'select', label: 'Select' },
  { id: 'text', label: 'Text' },
  { id: 'highlight', label: 'Highlight' },
  { id: 'rect', label: 'Box' },
  { id: 'whiteout', label: 'White-out' },
  { id: 'draw', label: 'Draw' },
];

export const COLORS = ['#111827', '#2563eb', '#dc2626', '#16a34a', '#f59e0b', '#fde047', '#ffffff'];
export const DEFAULT_COLORS = { text: '#111827', highlight: '#fde047', rect: '#dc2626', draw: '#2563eb' };
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

/** What /editPdf expects: pages in order, items on them, and the form values that changed. */
export const buildEdits = (pages, items, formValues, imageIndex) => {
  const position = new Map(pages.map((page, index) => [page.key, index]));
  return {
    pages: pages.map((page) => (page.blank
      ? { blank: true, rotate: page.rotate }
      : { file: page.file, page: page.page, rotate: page.rotate })),
    items: items
      .filter((item) => position.has(item.pageKey))
      .filter((item) => item.kind !== 'text' || item.text.trim())
      .map(({ id, pageKey, imageId, ...rest }) => ({
        ...rest,
        page: position.get(pageKey),
        ...(rest.kind === 'image' ? { image: imageIndex(imageId) } : {}),
      })),
    form: formValues,
  };
};

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
