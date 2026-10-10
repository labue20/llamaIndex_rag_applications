/**
 * Open Word documents (and images) in tools that work on PDFs: the server
 * turns them into a PDF (/toPdf), and the tool carries on with that.
 */

import { apiFetch, readApiError } from '../services/apiClient';

export const isPdfFile = (file) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
export const isWordFile = (file) => /\.docx$/i.test(file.name);
export const isImageFile = (file) => /\.(png|jpe?g|webp)$/i.test(file.name);

/** The file as a PDF: PDFs as they are; Word documents and images converted by the server. */
export const asPdf = async (file) => {
  if (isPdfFile(file)) return file;
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiFetch('/toPdf', { method: 'POST', body: formData });
  if (!response.ok) throw new Error(await readApiError(response, `${file.name} couldn’t be opened.`));
  const blob = await response.blob();
  return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.pdf`, { type: 'application/pdf' });
};
