import React, { useState } from 'react';
import '../../../shared/styles/converter.scss';

const formatSize = (bytes) => {
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
};

const WordToPdfConverter = () => {
  const [file, setFile] = useState(null);
  const [isConverting, setIsConverting] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleFileSelect = (event) => {
    const selectedFile = event.target.files[0];
    event.target.value = ''; // allow choosing the same file again
    if (!selectedFile) return;

    if (selectedFile.name.toLowerCase().endsWith('.docx')) {
      setFile(selectedFile);
    } else {
      alert('Please select a Word document (.docx)');
    }
  };

  const convertToPdf = async () => {
    if (!file) return;

    setIsConverting(true);
    setProgress(10);

    try {
      const formData = new FormData();
      formData.append('file', file);

      setProgress(30);

      const response = await fetch('http://localhost:5601/convertWordToPdf', {
        method: 'POST',
        body: formData,
      });

      setProgress(70);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Conversion failed');
      }

      const blob = await response.blob();
      setProgress(95);

      // Trigger download of the converted PDF
      const fileName = file.name.replace(/\.docx$/i, '_converted.pdf');
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      setProgress(100);
    } catch (error) {
      console.error('Conversion failed:', error);
      alert(`Failed to convert Word document to PDF: ${error.message}`);
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
            accept=".docx"
            onChange={handleFileSelect}
            disabled={isConverting}
            id="word-file-input"
          />
          <label htmlFor="word-file-input" className="upload-label">
            {file ? 'Change Word Doc' : 'Choose Word Doc'}
          </label>
          <p className="upload-hint">Drop your Word document (.docx) here or click to browse</p>
        </div>
      </div>

      {file && (
        <div className="pdf-info">
          <h4>Document Information</h4>
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">File:</span>
              <span className="info-value">{file.name}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Size:</span>
              <span className="info-value">{formatSize(file.size)}</span>
            </div>
          </div>
        </div>
      )}

      {file && (
        <div className="conversion-action">
          <button
            onClick={convertToPdf}
            disabled={isConverting}
            className="convert-btn"
          >
            <span className="btn-icon">
              {isConverting ? '⏳' : '🔄'}
            </span>
            {isConverting ? 'Converting...' : 'Convert to PDF'}
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
};

export default WordToPdfConverter;
