import { downloadBlob } from './downloadBlob';

beforeEach(() => {
  jest.useFakeTimers();
  window.URL.createObjectURL = jest.fn(() => 'blob:fake-url');
  window.URL.revokeObjectURL = jest.fn();
});

afterEach(() => {
  jest.useRealTimers();
});

test('downloads under the given name and only revokes the URL later', () => {
  const clicks = [];
  jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
    clicks.push({ href: this.href, download: this.download });
  });

  downloadBlob(new Blob(['data']), 'report_converted.docx');

  expect(clicks).toEqual([{ href: 'blob:fake-url', download: 'report_converted.docx' }]);
  // Revoking immediately can cancel the download (the original Word bug)
  expect(window.URL.revokeObjectURL).not.toHaveBeenCalled();

  jest.advanceTimersByTime(60 * 1000);
  expect(window.URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake-url');
  // The temporary link is removed from the page
  expect(document.querySelector('a[download]')).toBeNull();
});
