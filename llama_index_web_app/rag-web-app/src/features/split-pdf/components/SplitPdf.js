import React, { useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import '../../../shared/styles/converter.scss';

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const SplitPdf = () => {
  const [file, setFile] = useState(null);
  const [pdfInfo, setPdfInfo] = useState(null);

  const handleFileSelect = async (event) => {
    const selectedFile = event.target.files[0];
    event.target.value = ''; // allow choosing the same file again
    if (!selectedFile) return;

    if (selectedFile.type !== 'application/pdf') {
      alert('Please select a valid PDF file');
      return;
    }

    setFile(selectedFile);
    setPdfInfo({
      title: selectedFile.name,
      numPages: null,
      size: (selectedFile.size / 1024 / 1024).toFixed(2) + ' MB',
    });

    try {
      const pdf = await pdfjsLib.getDocument(await selectedFile.arrayBuffer()).promise;
      setPdfInfo((info) => ({ ...info, numPages: pdf.numPages }));
    } catch (error) {
      console.error('Error reading PDF info:', error);
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
            id="split-pdf-file-input"
          />
          <label htmlFor="split-pdf-file-input" className="upload-label">
            {file ? 'Change PDF File' : 'Choose PDF File'}
          </label>
          <p className="upload-hint">Drop your PDF here or click to browse • Max 50MB</p>
        </div>
      </div>

      {pdfInfo && (
        <div className="pdf-info">
          <h4>Document Information</h4>
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">File:</span>
              <span className="info-value">{pdfInfo.title}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Pages:</span>
              <span className="info-value">{pdfInfo.numPages ?? '…'}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Size:</span>
              <span className="info-value">{pdfInfo.size}</span>
            </div>
          </div>
        </div>
      )}

      {file && (
        <p className="converter-note">Splitting isn't available yet. It's coming soon.</p>
      )}
    </div>
  );
};

export default SplitPdf;
