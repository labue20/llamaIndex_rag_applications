/**
 * Save a Blob to the user's computer under the given file name.
 *
 * The object URL is revoked after a delay rather than immediately: revoking it
 * right after click() can cancel the download before it starts (notably in
 * Safari), leaving a file named after the blob's UUID that Word/Acrobat
 * then refuse to open.
 */
const REVOKE_DELAY_MS = 60 * 1000;

export const downloadBlob = (blob, fileName) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => window.URL.revokeObjectURL(url), REVOKE_DELAY_MS);
};
