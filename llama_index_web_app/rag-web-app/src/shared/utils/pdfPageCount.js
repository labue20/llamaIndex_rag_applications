/**
 * Count a PDF's pages in the browser with pdf.js.
 *
 * Uses pdf.js's webpack entry, which bundles its worker with the app (the
 * same setup as the PDF preview), so nothing is loaded from a CDN.
 */
import * as pdfjsLib from 'pdfjs-dist/webpack';

export const getPdfPageCount = async (file) => {
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const { numPages } = pdf;
  pdf.destroy();
  return numPages;
};
