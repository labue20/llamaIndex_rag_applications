import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { downloadBlob, apiFetch, getPdfPageCount, Icon, DocumentPicker } from '../../../shared';
import '../../../shared/styles/converter.scss';

const isPdf = (file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

const PdfToWordConverter = forwardRef(({ onStatusChange }, ref) => {
  const [file, setFile] = useState(null);
  const [isConverting, setIsConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [pageCount, setPageCount] = useState(null); // filled in once the PDF has been read
  const currentFileRef = useRef(null);

  const handleFileSelect = (event) => {
    const selectedFile = event.target.files[0];
    event.target.value = ''; // allow choosing the same file again
    if (selectedFile) loadFile(selectedFile);
  };

  const loadFile = async (selectedFile) => {
    if (isPdf(selectedFile)) {
      setFile(selectedFile);
      setPageCount(null);
      currentFileRef.current = selectedFile;
      try {
        const numPages = await getPdfPageCount(selectedFile);
        // Ignore the result if another file was chosen in the meantime
        if (currentFileRef.current === selectedFile) {
          setPageCount(numPages);
        }
      } catch (error) {
        console.error('Error reading PDF info:', error);
      }
    } else {
      alert('Please select a valid PDF file');
    }
  };

  const reset = () => {
    setFile(null);
    setPageCount(null);
    currentFileRef.current = null;
  };

  // Let the page header (ConverterHeaderActions) load a new file or close this one
  useImperativeHandle(ref, () => ({ selectFile: loadFile, reset }));

  useEffect(() => {
    onStatusChange?.({ hasFile: !!file, isBusy: isConverting });
  }, [onStatusChange, file, isConverting]);

  const convertToWord = async () => {
    if (!file) return;
    
    setIsConverting(true);
    setProgress(10);
    
    try {
      // Create FormData to send file to backend
      const formData = new FormData();
      formData.append('file', file);
      
      setProgress(30);
      
      // Send file to backend for conversion using PyMuPDF
      const response = await apiFetch('/convertPdfToWord', {
        method: 'POST',
        body: formData,
      });
      
      setProgress(60);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Conversion failed');
      }
      
      setProgress(80);
      
      // Get the converted Word document as blob
      const blob = await response.blob();
      setProgress(95);
      
      // Trigger download of the converted Word document
      const fileName = file.name.replace(/\.pdf$/i, '') + '_converted.docx';
      downloadBlob(blob, fileName);
      
      setProgress(100);
      
      setTimeout(() => {
        alert('Successfully converted PDF to Word document using PyMuPDF!');
      }, 500);
      
    } catch (error) {
      console.error('Conversion failed:', error);
      alert(`Failed to convert PDF to Word: ${error.message}`);
    } finally {
      setIsConverting(false);
      setProgress(0);
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
            disabled={isConverting}
            id="pdf-file-input"
          />
          <div className="upload-actions">
            <label htmlFor="pdf-file-input" className="upload-label">
              {file ? 'Change PDF File' : 'Choose PDF File'}
            </label>
            <DocumentPicker
              acceptedExtensions={['.pdf']}
              onSelect={(pickedFile) => pickedFile && loadFile(pickedFile)}
              disabled={isConverting}
            />
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
        <div className="conversion-action">
          <button 
            onClick={convertToWord}
            disabled={isConverting}
            className="convert-btn"
          >
            <span className="btn-icon" aria-hidden="true">
              {isConverting ? <span className="btn-spinner" /> : <Icon name="fileToWord" size={18} />}
            </span>
            {isConverting ? 'Converting...' : 'Convert to Word'}
          </button>
        </div>
      )}
      
      {isConverting && (
        <div className="progress-section">
          <div className="progress-header">
            <h4>Processing your document</h4>
            <span className="progress-percentage">{Math.round(progress)}%</span>
          </div>
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
});

export default PdfToWordConverter;
