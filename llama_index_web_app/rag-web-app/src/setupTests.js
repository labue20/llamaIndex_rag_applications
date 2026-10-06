import '@testing-library/jest-dom';
const { configure } = require('@testing-library/react');

configure({ testIdAttribute: 'data-testid' });

// pdfjs-dist ships ESM-only builds that Jest can't load; tests don't render PDFs.
const mockPdfjs = () => ({
  GlobalWorkerOptions: {},
  getDocument: jest.fn(() => ({ promise: Promise.resolve({ numPages: 0, getPage: jest.fn() }) })),
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
