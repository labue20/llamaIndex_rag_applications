/**
 * Compress PDF Component
 * Make a PDF smaller to email or upload: choose how much, and see the size
 * before and after. The server does the compressing (/compressPdf).
 */

import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  apiFetch,
  DocumentPicker,
  downloadBlob,
  filenameFromDisposition,
  getPdfPageCount,
  Icon,
  readApiError,
} from '../../../shared';
import '../../../shared/styles/converter.scss';

const LEVELS = [
  { id: 'light', title: 'Light', description: 'Sharpest images, smaller file' },
  { id: 'recommended', title: 'Recommended', description: 'Good quality for screens and printing' },
  { id: 'strong', title: 'Strong', description: 'Smallest file, lower image quality' },
];

const isPdf = (file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

export const formatSize = (bytes) => (bytes >= 1024 * 1024
  ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
  : `${Math.max(1, Math.round(bytes / 1024))} KB`);

const CompressPdf = forwardRef(({ onStatusChange, allowDocumentManager = true }, ref) => {
  const [file, setFile] = useState(null);
  const [pageCount, setPageCount] = useState(null); // filled in once the PDF has been read
  const [level, setLevel] = useState('recommended');
  const [isCompressing, setIsCompressing] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null); // { fileName, before, after } once done
  const currentFileRef = useRef(null);

  const loadFile = async (selectedFile) => {
    if (!isPdf(selectedFile)) {
      alert('Please select a valid PDF file');
      return;
    }
    setFile(selectedFile);
    setPageCount(null);
    setError('');
    setResult(null);
    currentFileRef.current = selectedFile;

    try {
      const numPages = await getPdfPageCount(selectedFile);
      // Ignore the result if another file was chosen in the meantime
      if (currentFileRef.current === selectedFile) {
        setPageCount(numPages);
      }
    } catch (err) {
      console.error('Error reading PDF info:', err);
    }
  };

  const handleFileSelect = (event) => {
    const selectedFile = event.target.files[0];
    event.target.value = ''; // allow choosing the same file again
    if (selectedFile) loadFile(selectedFile);
  };

  const reset = () => {
    setFile(null);
    setPageCount(null);
    setError('');
    setResult(null);
    currentFileRef.current = null;
  };

  // Let the page header (ConverterHeaderActions) load a new file or close this one
  useImperativeHandle(ref, () => ({ selectFile: loadFile, reset }));

  useEffect(() => {
    onStatusChange?.({ hasFile: !!file, isBusy: isCompressing });
  }, [onStatusChange, file, isCompressing]);

  const compressPdf = async () => {
    if (!file) return;
    setIsCompressing(true);
    setError('');
    setResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('level', level);

      const response = await apiFetch('/compressPdf', { method: 'POST', body: formData });
      if (!response.ok) {
        throw new Error(await readApiError(response, 'The PDF could not be compressed.'));
      }

      const blob = await response.blob();
      // The server sends the original back when it couldn't be made smaller
      if (blob.size >= file.size) {
        setResult({ fileName: '', before: file.size, after: file.size });
        return;
      }
      const fileName = filenameFromDisposition(
        response.headers.get('Content-Disposition'),
        `${file.name.replace(/\.pdf$/i, '')}_compressed.pdf`
      );
      downloadBlob(blob, fileName);
      setResult({ fileName, before: file.size, after: blob.size });
    } catch (err) {
      console.error('Compress failed:', err);
      setError(err.message);
    } finally {
      setIsCompressing(false);
    }
  };

  const saved = result && Math.round((1 - result.after / result.before) * 100);

  return (
    <div className="file-converter">
      <div className="file-input-section">
        <div className="upload-area">
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileSelect}
            disabled={isCompressing}
            id="compress-pdf-file-input"
          />
          <div className="upload-actions">
            <label htmlFor="compress-pdf-file-input" className="upload-label">
              {file ? 'Change PDF File' : 'Choose PDF File'}
            </label>
            {allowDocumentManager && (
              <DocumentPicker
                acceptedExtensions={['.pdf']}
                onSelect={(pickedFile) => pickedFile && loadFile(pickedFile)}
                disabled={isCompressing}
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
              <span className="info-value">{formatSize(file.size)}</span>
            </div>
          </div>
        </div>
      )}

      {file && (
        <div className="split-settings">
          <fieldset className="split-options" disabled={isCompressing}>
            <legend className="split-options__legend">How much should it shrink?</legend>
            {LEVELS.map((option) => (
              <label
                key={option.id}
                className={`split-option ${level === option.id ? 'split-option--selected' : ''}`}
              >
                <input
                  type="radio"
                  name="compress-level"
                  value={option.id}
                  checked={level === option.id}
                  onChange={() => {
                    setLevel(option.id);
                    setResult(null);
                  }}
                />
                <span className="split-option__title">{option.title}</span>
                <span className="split-option__description">{option.description}</span>
              </label>
            ))}
          </fieldset>
        </div>
      )}

      {error && (
        <div className="converter-message converter-message--error" role="alert">
          <Icon name="alert" size={16} />
          <span>{error}</span>
        </div>
      )}

      {result && !error && (
        <div className="converter-message converter-message--success" role="status">
          <Icon name="checkCircle" size={16} />
          {result.fileName ? (
            <span>
              Downloaded {result.fileName}: {formatSize(result.before)} → {formatSize(result.after)}
              {saved > 0 ? ` (${saved}% smaller)` : ''}
            </span>
          ) : (
            <span>
              This PDF is already as small as it gets
              {level === 'strong' ? '.' : '. Try Strong to shrink it further.'}
            </span>
          )}
        </div>
      )}

      {file && (
        <div className="conversion-action">
          <button onClick={compressPdf} disabled={isCompressing} className="convert-btn">
            <span className="btn-icon" aria-hidden="true">
              {isCompressing ? <span className="btn-spinner" /> : <Icon name="compress" size={18} />}
            </span>
            {isCompressing ? 'Compressing...' : 'Compress PDF'}
          </button>
        </div>
      )}
    </div>
  );
});

export default CompressPdf;
