import React, { useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { downloadBlob } from '../../../shared';
import '../../../shared/styles/converter.scss';


pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const PdfToWordConverter = () => {
  const [file, setFile] = useState(null);
  const [isConverting, setIsConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [pdfInfo, setPdfInfo] = useState(null); // PDF file information

  const handleFileSelect = async (event) => {
    const selectedFile = event.target.files[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
      try {
        const arrayBuffer = await selectedFile.arrayBuffer();
        const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
        setPdfInfo({
          numPages: pdf.numPages,
          title: selectedFile.name,
          size: (selectedFile.size / 1024 / 1024).toFixed(2) + ' MB'
        });
      } catch (error) {
        console.error('Error reading PDF info:', error);
      }
    } else {
      alert('Please select a valid PDF file');
    }
  };

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
      const response = await fetch('http://localhost:5601/convertPdfToWord', {
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
          <label htmlFor="pdf-file-input" className="upload-label">
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
              <span className="info-value">{pdfInfo.numPages}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Size:</span>
              <span className="info-value">{pdfInfo.size}</span>
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
            <span className="btn-icon">
              {isConverting ? '⏳' : '🔄'}
            </span>
            {isConverting ? 'Converting Magic...' : 'Convert to Word'}
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

export default PdfToWordConverter;
