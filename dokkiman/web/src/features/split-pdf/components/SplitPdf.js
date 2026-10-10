/**
 * Split PDF Component
 * Split a PDF into one file per page, into page ranges, or extract selected
 * pages into one file. Every page is previewed, and pages can be picked by
 * clicking them as well as typed. The server does the splitting (/splitPdf).
 */

import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist/webpack';
import {
  apiFetch,
  DocumentPicker,
  downloadBlob,
  filenameFromDisposition,
  Icon,
  readApiError,
} from '../../../shared';
import { formatRanges, parseRanges, partOfPage, togglePage } from '../pageSelection';
import PageGrid from './PageGrid';
import '../../../shared/styles/converter.scss';

const MODES = [
  { id: 'every', title: 'Every page', description: 'Each page becomes its own PDF' },
  { id: 'ranges', title: 'Custom ranges', description: 'One PDF per range, e.g. 1-3, 4-6' },
  { id: 'extract', title: 'Extract pages', description: 'Selected pages combined into one PDF' },
];

const isPdf = (file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

const SplitPdf = forwardRef(({ onStatusChange, allowDocumentManager = true }, ref) => {
  const [file, setFile] = useState(null);
  const [pageCount, setPageCount] = useState(null); // filled in once the PDF has been read
  const [pdf, setPdf] = useState(null); // pdf.js document, for the page previews
  const [mode, setMode] = useState('every');
  const [ranges, setRanges] = useState('');
  const [isSplitting, setIsSplitting] = useState(false);
  const [error, setError] = useState('');
  const [downloaded, setDownloaded] = useState('');
  const currentFileRef = useRef(null);

  const needsRanges = mode !== 'every';

  const loadFile = async (selectedFile) => {
    if (!isPdf(selectedFile)) {
      alert('Please select a valid PDF file');
      return;
    }
    setFile(selectedFile);
    setPageCount(null);
    setPdf(null);
    setError('');
    setDownloaded('');
    currentFileRef.current = selectedFile;

    try {
      const data = selectedFile.arrayBuffer ? await selectedFile.arrayBuffer() : new ArrayBuffer(0);
      const doc = await pdfjsLib.getDocument({ data }).promise;
      // Ignore the result if another file was chosen in the meantime
      if (currentFileRef.current === selectedFile) {
        setPdf(doc);
        setPageCount(doc.numPages);
      } else {
        doc.destroy();
      }
    } catch (err) {
      console.error('Error reading PDF info:', err);
    }
  };

  // Free the previous PDF's memory when another is opened or it's closed
  useEffect(() => () => pdf?.destroy?.(), [pdf]);

  const handleFileSelect = (event) => {
    const selectedFile = event.target.files[0];
    event.target.value = ''; // allow choosing the same file again
    if (selectedFile) loadFile(selectedFile);
  };

  const reset = () => {
    setFile(null);
    setPageCount(null);
    setPdf(null);
    setRanges('');
    setError('');
    setDownloaded('');
    currentFileRef.current = null;
  };

  // Let the page header (ConverterHeaderActions) load a new file or close this one
  useImperativeHandle(ref, () => ({ selectFile: loadFile, reset }));

  useEffect(() => {
    onStatusChange?.({ hasFile: !!file, isBusy: isSplitting });
  }, [onStatusChange, file, isSplitting]);

  // Pages picked on the previews and typed in the Pages box stay in step
  const pickedRanges = pageCount ? parseRanges(ranges, pageCount) : [];
  const parts = mode === 'every' ? new Map() : partOfPage(pickedRanges);
  const pickPage = (page) => {
    setError('');
    setDownloaded('');
    // From "Every page", picking a page means choosing pages to extract
    const pickMode = mode === 'every' ? 'extract' : mode;
    if (mode === 'every') setMode('extract');
    setRanges(formatRanges(togglePage(mode === 'every' ? [] : pickedRanges, page, pickMode)));
  };

  const splitPdf = async () => {
    if (!file) return;
    if (needsRanges && !ranges.trim()) {
      setError('Enter the pages to use, for example 1-3, 5.');
      return;
    }

    setIsSplitting(true);
    setError('');
    setDownloaded('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mode', mode);
      if (needsRanges) formData.append('ranges', ranges);

      const response = await apiFetch('/splitPdf', { method: 'POST', body: formData });
      if (!response.ok) {
        throw new Error(await readApiError(response, 'The PDF could not be split.'));
      }

      const blob = await response.blob();
      const stem = file.name.replace(/\.pdf$/i, '');
      const fileName = filenameFromDisposition(
        response.headers.get('Content-Disposition'),
        blob.type === 'application/zip' ? `${stem}_split.zip` : `${stem}_split.pdf`
      );
      downloadBlob(blob, fileName);
      setDownloaded(fileName);
    } catch (err) {
      console.error('Split failed:', err);
      setError(err.message);
    } finally {
      setIsSplitting(false);
    }
  };

  return (
    <div className="file-converter">
      <div className="file-input-section">
        <div className="upload-area">
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileSelect}
            disabled={isSplitting}
            id="split-pdf-file-input"
          />
          <div className="upload-actions">
            <label htmlFor="split-pdf-file-input" className="upload-label">
              {file ? 'Change PDF File' : 'Choose PDF File'}
            </label>
            {allowDocumentManager && (
              <DocumentPicker
                acceptedExtensions={['.pdf']}
                onSelect={(pickedFile) => pickedFile && loadFile(pickedFile)}
                disabled={isSplitting}
              />
            )}
          </div>
          <p className="upload-hint">Drop your PDF here or click to browse • Max 50MB</p>
        </div>
      </div>

      {file && (
        <div className="pdf-info">
          <h4>Document Information</h4>
          <div className="info-grid">
            <div className="info-item info-item--wide">
              <span className="info-label">File</span>
              <span className="info-value">{file.name}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Pages</span>
              <span className="info-value">{pageCount ?? '…'}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Size</span>
              <span className="info-value">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
            </div>
          </div>
        </div>
      )}

      {file && (
        <div className="split-settings">
          <fieldset className="split-options" disabled={isSplitting}>
            <legend className="split-options__legend">How do you want to split it?</legend>
            {MODES.map((option) => (
              <label
                key={option.id}
                className={`split-option ${mode === option.id ? 'split-option--selected' : ''}`}
              >
                <input
                  type="radio"
                  name="split-mode"
                  value={option.id}
                  checked={mode === option.id}
                  onChange={() => {
                    setMode(option.id);
                    setError('');
                  }}
                />
                <span className="split-option__title">{option.title}</span>
                <span className="split-option__description">{option.description}</span>
              </label>
            ))}
          </fieldset>

          {needsRanges && (
            <div className="split-ranges">
              <label className="split-ranges__label" htmlFor="split-ranges-input">Pages</label>
              <input
                id="split-ranges-input"
                type="text"
                className="split-ranges__input"
                value={ranges}
                onChange={(e) => setRanges(e.target.value)}
                placeholder={mode === 'ranges' ? 'e.g. 1-3, 4-6, 7' : 'e.g. 1, 3-5'}
                aria-describedby="split-ranges-hint"
                disabled={isSplitting}
              />
              <span className="split-ranges__hint" id="split-ranges-hint">
                {pageCount ? `This PDF has ${pageCount} ${pageCount === 1 ? 'page' : 'pages'}. ` : ''}
                Separate pages and ranges with commas, or click the pages below.
              </span>
            </div>
          )}

          {pdf && pageCount && (
            <div className="split-preview">
              <p className="split-preview__caption">
                {mode === 'every' && `Each of the ${pageCount} pages becomes its own PDF. Click pages to keep only some.`}
                {mode === 'ranges' && 'Click pages to add or remove them. Each range becomes its own PDF.'}
                {mode === 'extract' && 'Click the pages to keep. They’re combined into one PDF.'}
              </p>
              <PageGrid
                pdf={pdf}
                pageCount={pageCount}
                mode={mode}
                parts={parts}
                disabled={isSplitting}
                onToggle={pickPage}
              />
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="converter-message converter-message--error" role="alert">
          <Icon name="alert" size={16} />
          <span>{error}</span>
        </div>
      )}

      {downloaded && !error && (
        <div className="converter-message converter-message--success" role="status">
          <Icon name="checkCircle" size={16} />
          <span>Downloaded {downloaded}</span>
        </div>
      )}

      {file && (
        <div className="conversion-action">
          <button onClick={splitPdf} disabled={isSplitting} className="convert-btn">
            <span className="btn-icon" aria-hidden="true">
              {isSplitting ? <span className="btn-spinner" /> : <Icon name="scissors" size={18} />}
            </span>
            {isSplitting ? 'Splitting...' : 'Split PDF'}
          </button>
        </div>
      )}
    </div>
  );
});

export default SplitPdf;
