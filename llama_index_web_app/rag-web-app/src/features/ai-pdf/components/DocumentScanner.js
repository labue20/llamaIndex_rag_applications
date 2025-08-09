/**
 * Document Scanner Component
 * Displays document content and allows users to scan/preview documents
 */

import React, { useState, useEffect } from 'react';
import { apiClient } from '../../../shared';

const DocumentScanner = ({ document, isVisible, onClose }) => {
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [documentContent, setDocumentContent] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isVisible && document) {
      startScan();
    }
  }, [isVisible, document]);

  const startScan = async () => {
    setIsScanning(true);
    setScanProgress(0);
    setError('');
    setDocumentContent('');

    try {
      // Simulate scanning progress
      const progressInterval = setInterval(() => {
        setScanProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      // Fetch full document content from backend
      const data = await apiClient.get(`/getFullDocument/${document.id}`);
      
      clearInterval(progressInterval);
      setScanProgress(100);

      const content = data.full_text || data.full_reconstructed_text || data.content_preview || data.text || '';
      if (content && content.length > 0) {
        setDocumentContent(content);
      } else {
        setDocumentContent(`Document: ${document.name || document.file_path?.split('/').pop() || document.id}\nType: ${document.type || document.file_type || 'Unknown'}\nSize: ${document.size ? `${(document.size / 1024).toFixed(2)} KB` : (document.file_size ? `${(document.file_size / 1024).toFixed(2)} KB` : 'Unknown')}\n\nContent preview not available for this document type.`);
      }
    } catch (err) {
      console.error('Error scanning document:', err);
      setError('Failed to scan document. Please try again.');
      setScanProgress(0);
    } finally {
      setIsScanning(false);
    }
  };

  const isPDF = (() => {
    const path = document?.file_path || document?.name || '';
    const type = document?.file_type || document?.type || '';
    return path.toLowerCase().endsWith('.pdf') || String(type).toLowerCase().includes('pdf');
  })();

  if (!isVisible) return null;

  return (
    <div className="document-scanner-overlay">
      <div className="document-scanner">
        <div className="document-scanner__header">
          <h3 className="document-scanner__title">
            📄 Document Scanner - {document?.name}
          </h3>
          <button 
            className="document-scanner__close"
            onClick={onClose}
            aria-label="Close scanner"
          >
            ×
          </button>
        </div>

        <div className="document-scanner__content">
          {isScanning && (
            <div className="document-scanner__scanning">
              <div className="document-scanner__progress-container">
                <div className="document-scanner__progress-label">
                  🔍 Scanning document...
                </div>
                <div className="document-scanner__progress-bar">
                  <div 
                    className="document-scanner__progress-fill"
                    style={{ width: `${scanProgress}%` }}
                  ></div>
                </div>
                <div className="document-scanner__progress-text">
                  {scanProgress}%
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="document-scanner__error">
              <div className="document-scanner__error-icon">⚠️</div>
              <div className="document-scanner__error-message">{error}</div>
              <button 
                className="document-scanner__retry-button"
                onClick={startScan}
              >
                🔄 Retry Scan
              </button>
            </div>
          )}

          {!isScanning && !error && documentContent && (
            <div className="document-scanner__result">
              <div className="document-scanner__result-header">
                <div className="document-scanner__result-info">
                  <span className="document-scanner__result-icon">
                    {isPDF ? '📄' : '📁'}
                  </span>
                  <span className="document-scanner__result-name">
                    {document.name}
                  </span>
                  {document.size && (
                    <span className="document-scanner__result-size">
                      ({(document.size / 1024).toFixed(2)} KB)
                    </span>
                  )}
                </div>
                <button 
                  className="document-scanner__rescan-button"
                  onClick={startScan}
                  disabled={isScanning}
                >
                  🔄 Rescan
                </button>
              </div>

              <div className="document-scanner__preview">
                <div className="document-scanner__preview-header">
                  📖 Document Preview
                </div>
                <div className="document-scanner__preview-content">
                  <pre className="document-scanner__content-text">
                    {documentContent}
                  </pre>
                </div>
              </div>

              {isPDF && (
                <div className="document-scanner__actions">
                  <button className="document-scanner__action-button document-scanner__action-button--primary">
                    💬 Chat with this PDF
                  </button>
                  <button className="document-scanner__action-button document-scanner__action-button--secondary">
                    📋 Generate Summary
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DocumentScanner;
