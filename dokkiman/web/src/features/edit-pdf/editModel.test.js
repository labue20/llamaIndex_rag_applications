import { buildEdits, fieldValue, formFieldsFrom, rotateBy, shownSize } from './editModel';

test('rotating swaps the shown size', () => {
  expect(shownSize({ width: 600, height: 800, rotate: 0 })).toEqual({ width: 600, height: 800 });
  expect(shownSize({ width: 600, height: 800, rotate: 90 })).toEqual({ width: 800, height: 600 });
  expect(rotateBy(270, 90)).toBe(0);
  expect(rotateBy(0, -90)).toBe(270);
});

test('edits follow the pages’ new order and leave out deleted pages', () => {
  const pages = [
    { key: 'b', file: 0, page: 1, rotate: 90 },
    { key: 'n', blank: true, rotate: 0 },
    { key: 'a', file: 1, page: 0, rotate: 0 },
  ];
  const items = [
    { id: 1, pageKey: 'a', kind: 'text', text: 'Hi', x: 0, y: 0, width: 0.2, height: 0.1 },
    { id: 2, pageKey: 'gone', kind: 'rect', x: 0, y: 0, width: 0.2, height: 0.1 },
    { id: 3, pageKey: 'b', kind: 'image', imageId: 'img-7', x: 0, y: 0, width: 0.2, height: 0.1 },
    { id: 4, pageKey: 'b', kind: 'text', text: '   ', x: 0, y: 0, width: 0.2, height: 0.1 },
  ];
  const edits = buildEdits(pages, items, { name: 'Sam' }, (id) => (id === 'img-7' ? 0 : -1));
  expect(edits.pages).toEqual([{ file: 0, page: 1, rotate: 90 }, { blank: true, rotate: 0 }, { file: 1, page: 0, rotate: 0 }]);
  expect(edits.items).toEqual([
    { kind: 'text', text: 'Hi', x: 0, y: 0, width: 0.2, height: 0.1, page: 2 },
    { kind: 'image', x: 0, y: 0, width: 0.2, height: 0.1, page: 0, image: 0 },
  ]);
  expect(edits.form).toEqual({ name: 'Sam' });
});

test('form fields come from the PDF’s widgets', () => {
  const viewport = {
    width: 600, height: 800,
    // PDF space (origin bottom-left) to the screen (origin top-left)
    convertToViewportRectangle: ([x1, y1, x2, y2]) => [x1, 800 - y1, x2, 800 - y2],
  };
  const fields = formFieldsFrom([
    { id: '1R', subtype: 'Widget', fieldName: 'name', fieldType: 'Tx', rect: [60, 700, 360, 720], fieldValue: 'Jo' },
    { id: '2R', subtype: 'Widget', fieldName: 'agree', fieldType: 'Btn', checkBox: true, exportValue: 'Yes',
      rect: [60, 600, 80, 620], fieldValue: 'Off' },
    { id: '3R', subtype: 'Widget', fieldName: 'size', fieldType: 'Btn', radioButton: true, buttonValue: 'L',
      rect: [60, 500, 80, 520] },
    { id: '4R', subtype: 'Widget', fieldName: 'pick', fieldType: 'Ch', rect: [60, 400, 200, 420],
      options: [{ exportValue: 'r', displayValue: 'Red' }] },
    { id: '5R', subtype: 'Widget', fieldName: 'locked', fieldType: 'Tx', readOnly: true, rect: [0, 0, 1, 1] },
    { id: '6R', subtype: 'Link', rect: [0, 0, 1, 1] },
  ], viewport);
  expect(fields.map((f) => [f.name, f.type])).toEqual([['name', 'text'], ['agree', 'checkbox'], ['size', 'radio'], ['pick', 'choice']]);
  expect(fields[0]).toMatchObject({ x: 0.1, y: 0.1, width: 0.5, height: 0.025 });
  expect(fields[2].onValue).toBe('L');
  expect(fields[3].options).toEqual([{ value: 'r', label: 'Red' }]);
  expect(fieldValue(fields[0], {})).toBe('Jo');
  expect(fieldValue(fields[0], { name: 'Sam' })).toBe('Sam');
  expect(fieldValue(fields[1], {})).toBe(false);
});
