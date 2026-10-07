import '@testing-library/jest-dom';
import { TextDecoder, TextEncoder } from 'util';

// React Router needs these browser globals, which CRA's jsdom lacks
Object.assign(global, { TextEncoder, TextDecoder });
const { configure } = require('@testing-library/react');

configure({ testIdAttribute: 'data-testid' });

// pdfjs-dist ships ESM-only builds that Jest can't load; tests don't render PDFs.
const mockPdfjs = () => ({
  GlobalWorkerOptions: {},
  // Plain functions (not jest.fn) so restoreAllMocks between tests doesn't wipe them
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: 3,
      getPage: () => Promise.resolve({
        getViewport: ({ scale = 1 } = {}) => ({ width: 600 * scale, height: 800 * scale }),
        render: () => ({ promise: Promise.resolve(), cancel: () => {} }),
      }),
      destroy: () => {},
    }),
  }),
});
jest.mock('pdfjs-dist', () => mockPdfjs());
jest.mock('pdfjs-dist/webpack', () => mockPdfjs(), { virtual: true });

// The app logs a lot of debugging output with console.log; keep test output readable
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

// jsdom doesn't implement scrolling; components call it to keep chats scrolled
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
