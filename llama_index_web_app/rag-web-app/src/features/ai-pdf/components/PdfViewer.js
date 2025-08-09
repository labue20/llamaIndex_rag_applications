/**
 * PDF Viewer Component
 * Displays PDF content in a dedicated viewer pane with pagination
 */

import React, { useState, useEffect } from 'react';
import { apiClient } from '../../../shared';

const PdfViewer = ({ document, isVisible, onStartChat, onGenerateSummary }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [documentContent, setDocumentContent] = useState('');
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState('content'); // 'content' or 'metadata'
  const [currentPage, setCurrentPage] = useState(1);
  const [pages, setPages] = useState([]);
  const [totalPages, setTotalPages] = useState(0);

  // Split content into pages (approximately 1000 characters per page)
  const splitContentIntoPages = (content) => {
    if (!content || content.length === 0) return [];
    
    const wordsPerPage = 200; // Approximately 200 words per page
    const words = content.split(/\s+/);
    const pageArray = [];
    
    for (let i = 0; i < words.length; i += wordsPerPage) {
      const pageWords = words.slice(i, i + wordsPerPage);
      pageArray.push(pageWords.join(' '));
    }
    
    return pageArray.length > 0 ? pageArray : [content];
  };

  useEffect(() => {
    if (documentContent) {
      const pageArray = splitContentIntoPages(documentContent);
      setPages(pageArray);
      setTotalPages(pageArray.length);
      setCurrentPage(1);
    }
  }, [documentContent]);

  useEffect(() => {
    if (isVisible && document) {
      loadDocumentContent();
    }
  }, [isVisible, document]);

  const loadDocumentContent = async () => {
    setIsLoading(true);
    setError('');
    setDocumentContent('');

    try {
      // Fetch full document content from Flask API
      const data = await apiClient.get(`/getFullDocument/${document.id}`);

      // Prefer full_text if available, else use reconstructed text or preview
      const content = data.full_text || data.full_reconstructed_text || data.content_preview || data.text || '';
      if (content && content.length > 0) {
        setDocumentContent(content);
      } else {
        setDocumentContent(generateFallbackContent(document));
      }
    } catch (err) {
      console.error('Error loading document:', err);
      setDocumentContent(generateFallbackContent(document));
    } finally {
      setIsLoading(false);
    }
  };

  const generateFallbackContent = (doc) => {
    return `Document: ${doc.name}
Type: ${doc.type || 'PDF Document'}
Size: ${doc.size ? `${(doc.size / 1024).toFixed(2)} KB` : 'Unknown'}

📄 PDF Content Preview

This is a preview of the PDF document. The actual content would be displayed here when the document processing is complete.

Key Information:
• Document Name: ${doc.name}
• File Type: PDF
• Upload Status: Ready for processing
• Available Actions: Chat, Summarize, Query

Note: Full PDF content rendering is available when connected to the document processing service.

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.

Section 1: Introduction
This section would contain the actual PDF content extracted from the document.

Section 2: Main Content
The main body of the PDF document would be displayed here with proper formatting and structure.

Section 3: Conclusion
Summary and concluding remarks from the original PDF document.`;
  };

  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const goToPrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const goToFirstPage = () => {
    setCurrentPage(1);
  };

  const goToLastPage = () => {
    setCurrentPage(totalPages);
  };

  const handlePageInput = (e) => {
    const pageNum = parseInt(e.target.value, 10);
    if (pageNum >= 1 && pageNum <= totalPages) {
      setCurrentPage(pageNum);
    }
  };

  const handleStartChat = () => {
    if (onStartChat && document) {
      onStartChat(document);
    }
  };

  const handleGenerateSummary = () => {
    if (onGenerateSummary && document) {
      onGenerateSummary(document);
    }
  };

  const isPDF = (() => {
    const path = document?.file_path || document?.name || '';
    const type = document?.file_type || document?.type || '';
    return path.toLowerCase().endsWith('.pdf') || String(type).toLowerCase().includes('pdf');
  })();

  if (!isVisible || !document) {
    return (
      <div className="pdf-viewer pdf-viewer--empty">
        <div className="pdf-viewer__empty-state">
          <div className="pdf-viewer__empty-icon">📄</div>
          <h3 className="pdf-viewer__empty-title">No Document Selected</h3>
          <p className="pdf-viewer__empty-text">
            Upload a PDF document and click "View & Chat" to view it here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="pdf-viewer">
      <div className="pdf-viewer__header">
  <div className="pdf-viewer__document-info">
          <div className="pdf-viewer__document-details">
            <h3 className="pdf-viewer__document-name">{document.name || document.file_path?.split('/').pop() || document.id}</h3>
            <div className="pdf-viewer__document-meta">
              {document.size && (
                <span className="pdf-viewer__document-size">
                  {(document.size / 1024).toFixed(2)} KB
                </span>
              )}
              <span className="pdf-viewer__document-type">
                {document.type || document.file_type || 'PDF Document'}
              </span>
            </div>
          </div>
        </div>

        <div className="pdf-viewer__controls">
          <div className="pdf-viewer__view-modes">
            <button
              className={`pdf-viewer__view-mode ${viewMode === 'content' ? 'pdf-viewer__view-mode--active' : ''}`}
              onClick={() => setViewMode('content')}
            >
              📖 Content
            </button>
            <button
              className={`pdf-viewer__view-mode ${viewMode === 'metadata' ? 'pdf-viewer__view-mode--active' : ''}`}
              onClick={() => setViewMode('metadata')}
            >
              ℹ️ Info
            </button>
          </div>
          
          {/* Pagination Controls - Only show for content view with multiple pages */}
          {viewMode === 'content' && totalPages > 1 && (
            <div className="pdf-viewer__pagination">
              <button 
                className="pdf-viewer__nav-btn"
                onClick={goToFirstPage}
                disabled={currentPage === 1}
                title="First Page"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/>
                </svg>
              </button>
              <button 
                className="pdf-viewer__nav-btn"
                onClick={goToPrevPage}
                disabled={currentPage === 1}
                title="Previous Page"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 18l-6-6 6-6"/>
                </svg>
              </button>
              
              <div className="pdf-viewer__page-info">
                <span>Page </span>
                <input 
                  type="number"
                  min="1"
                  max={totalPages}
                  value={currentPage}
                  onChange={handlePageInput}
                  className="pdf-viewer__page-input"
                  title="Enter page number"
                />
                <span> of {totalPages}</span>
              </div>
              
              <button 
                className="pdf-viewer__nav-btn"
                onClick={goToNextPage}
                disabled={currentPage === totalPages}
                title="Next Page"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </button>
              <button 
                className="pdf-viewer__nav-btn"
                onClick={goToLastPage}
                disabled={currentPage === totalPages}
                title="Last Page"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M13 5l7 7-7 7M6 5l7 7-7 7"/>
                </svg>
              </button>
            </div>
          )}
          
          <button 
            className="pdf-viewer__refresh-button"
            onClick={loadDocumentContent}
            disabled={isLoading}
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      <div className="pdf-viewer__content">
        {isLoading && (
          <div className="pdf-viewer__loading">
            <div className="pdf-viewer__loading-spinner"></div>
            <p>Loading document content...</p>
          </div>
        )}

        {error && (
          <div className="pdf-viewer__error">
            <div className="pdf-viewer__error-icon">⚠️</div>
            <div className="pdf-viewer__error-message">{error}</div>
            <button 
              className="pdf-viewer__retry-button"
              onClick={loadDocumentContent}
            >
              🔄 Retry
            </button>
          </div>
        )}

        {!isLoading && !error && viewMode === 'content' && (
          <div className="pdf-viewer__document-content">
            <div className="pdf-viewer__page-content">
              <div className="pdf-viewer__page-header">
                {totalPages > 1 && (
                  <div className="pdf-viewer__current-page-info">
                    Page {currentPage} of {totalPages}
                  </div>
                )}
              </div>
              <pre className="pdf-viewer__content-text">
                {pages.length > 0 ? pages[currentPage - 1] || documentContent : documentContent}
              </pre>
            </div>
          </div>
        )}

        {!isLoading && !error && viewMode === 'metadata' && (
          <div className="pdf-viewer__metadata">
            <div className="pdf-viewer__metadata-section">
              <h4>📋 Document Information</h4>
              <div className="pdf-viewer__metadata-item">
                <strong>Name:</strong> {document.name}
              </div>
              <div className="pdf-viewer__metadata-item">
                <strong>Type:</strong> {document.type || 'PDF Document'}
              </div>
              <div className="pdf-viewer__metadata-item">
                <strong>Size:</strong> {document.size ? `${(document.size / 1024).toFixed(2)} KB` : 'Unknown'}
              </div>
              <div className="pdf-viewer__metadata-item">
                <strong>ID:</strong> {document.id}
              </div>
            </div>

            <div className="pdf-viewer__metadata-section">
              <h4>🔍 Available Actions</h4>
              <div className="pdf-viewer__action-list">
                <div className="pdf-viewer__action-item">💬 Chat with this document</div>
                <div className="pdf-viewer__action-item">📄 Generate summary</div>
                <div className="pdf-viewer__action-item">🔍 Query specific information</div>
                <div className="pdf-viewer__action-item">📥 Export content</div>
              </div>
            </div>

            <div className="pdf-viewer__metadata-section">
              <h4>📊 Processing Status</h4>
              <div className="pdf-viewer__status-item">
                <span className="pdf-viewer__status-indicator pdf-viewer__status-indicator--ready"></span>
                Ready for AI processing
              </div>
            </div>
          </div>
        )}
      </div>

  {/* Footer quick actions removed per request */}
    </div>
  );
};

export default PdfViewer;
