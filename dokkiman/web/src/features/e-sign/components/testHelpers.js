/**
 * Test helpers for E-Sign: a fake backend that also serves PDF bytes (and,
 * like the browser, refuses to fetch data: URLs), and a canvas good enough
 * for typed signatures.
 */

import { jsonResponse } from '../../../test-utils/mockFetch';

// routes: path -> spec ({status, body}), a function (url, options) -> spec,
// or {pdf: true} for a PDF download. Returns the requests made: [{path, method, body}]
export const mockServer = (routes) => {
  const requests = [];
  global.fetch = jest.fn((url, options = {}) => {
    // Like the browser, where the Content-Security-Policy doesn't allow fetching data: URLs
    if (String(url).startsWith('data:')) return Promise.reject(new TypeError('Load failed'));
    const path = new URL(url, 'http://localhost').pathname;
    const method = options.method || 'GET';
    requests.push({ path, method, body: options.body });
    const route = routes[`${method} ${path}`] ?? routes[path];
    const spec = typeof route === 'function' ? route(url, options) : route;
    if (!spec) return Promise.resolve(jsonResponse(404, { error: 'Not found' }));
    if (spec.pdf) {
      return Promise.resolve({
        ok: true, status: 200,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)),
        blob: () => Promise.resolve(new Blob(['%PDF'], { type: 'application/pdf' })),
        headers: { get: () => null },
      });
    }
    return Promise.resolve(jsonResponse(spec.status ?? 200, spec.body ?? {}));
  });
  return requests;
};

// jsdom has no canvas; give typed signatures something to draw on
export const mockCanvas = () => {
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

export const pdfFile = (name = 'lease.pdf') => {
  const file = new File(['%PDF'], name, { type: 'application/pdf' });
  file.arrayBuffer = () => Promise.resolve(new ArrayBuffer(4));
  return file;
};
