import { dataUrlToBlob } from './dataUrlToBlob';

const text = (blob) => new Promise((resolve) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.readAsText(blob);
});

describe('dataUrlToBlob', () => {
  it('decodes a base64 data URL without fetching it', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(() => Promise.reject(new TypeError('Load failed')));
    const blob = dataUrlToBlob(`data:image/png;base64,${btoa('PNG bytes')}`);
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBe(9);
    expect(await text(blob)).toBe('PNG bytes');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('decodes a plain (URL-encoded) data URL', async () => {
    const blob = dataUrlToBlob('data:text/plain,hello%20there');
    expect(blob.type).toBe('text/plain');
    expect(await text(blob)).toBe('hello there');
  });
});
