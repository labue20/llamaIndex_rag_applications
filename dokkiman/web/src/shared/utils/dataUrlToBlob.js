/**
 * Turn a data: URL (like a canvas's toDataURL()) into a Blob.
 * Decoded here rather than with fetch(dataUrl): the Content-Security-Policy's
 * connect-src doesn't allow data: URLs, so fetching one fails ("Load failed").
 */
export const dataUrlToBlob = (dataUrl) => {
  const comma = dataUrl.indexOf(',');
  const header = dataUrl.slice(0, comma);
  const data = dataUrl.slice(comma + 1);
  const type = (header.match(/^data:([^;,]+)/) || [])[1] || 'application/octet-stream';
  if (!header.endsWith(';base64')) return new Blob([decodeURIComponent(data)], { type });
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
};
