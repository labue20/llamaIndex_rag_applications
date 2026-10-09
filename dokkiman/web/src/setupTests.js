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
        rotate: 0,
        getViewport: ({ scale = 1 } = {}) => ({
          width: 600 * scale,
          height: 800 * scale,
          // PDF space (origin bottom-left) to the screen
          convertToViewportRectangle: ([x1, y1, x2, y2]) => [x1 * scale, (800 - y1) * scale, x2 * scale, (800 - y2) * scale],
        }),
        render: () => ({ promise: Promise.resolve(), cancel: () => {} }),
        // Tests with form fields set global.mockPdfAnnotations
        getAnnotations: () => Promise.resolve(global.mockPdfAnnotations || []),
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
  // Each test's fake server says how sign-in works; don't reuse an earlier answer
  require('./features/auth/hooks/useAuthConfig').resetAuthConfigCache();
  require('./features/auth/hooks/usePlanInfo').resetPlanInfoCache();
});
afterEach(() => {
  jest.restoreAllMocks();
});

// jsdom doesn't implement scrolling; components call it to keep chats scrolled
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
