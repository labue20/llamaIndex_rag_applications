/**
 * PDF Viewer Component
 * Displays PDF content in a dedicated viewer pane with pagination
 */

import React, { useState, useEffect, useRef } from 'react';
import { apiClient } from '../../../shared';
import * as pdfjsLib from 'pdfjs-dist/webpack';

// PDF.js worker is automatically configured when using the webpack import

const PdfViewer = ({ document, isVisible, onStartChat, onGenerateSummary }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [documentContent, setDocumentContent] = useState('');
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState('pdf'); // Default to PDF view mode
  const [currentPage, setCurrentPage] = useState(1);
  const [pages, setPages] = useState([]);
  const [totalPages, setTotalPages] = useState(0);
  const [pdfPages, setPdfPages] = useState([]); // For actual PDF pages
  const [pdfDocument, setPdfDocument] = useState(null);
  const canvasRefs = useRef([]);

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
    // Only split content into pages if we're in content mode (not PDF mode)
    if (documentContent && viewMode === 'content') {
      const pageArray = splitContentIntoPages(documentContent);
      setPages(pageArray);
      setTotalPages(pageArray.length);
      setCurrentPage(1);
    }
  }, [documentContent, viewMode]);

  useEffect(() => {
    if (isVisible && document) {
      loadDocumentContent();
    }
  }, [isVisible, document]);

  const loadDocumentContent = async () => {
    setIsLoading(true);
    setError('');
    setDocumentContent('');

    console.log('=== PdfViewer Debug Info ===');
    console.log('Document object:', document);
    console.log('Document.file:', document?.file);
    console.log('Document.originalFile:', document?.originalFile);
    console.log('Document.isTemporary:', document?.isTemporary);
    console.log('Document.name:', document?.name);
    console.log('================================');

    try {
      // Priority 1: If this is a temporary document (just selected, not uploaded yet)
      if (document.isTemporary && document.file) {
        console.log('Loading temporary document with file');
        await loadPdfFromFile(document.file);
        setIsLoading(false);
        return;
      }

      // Priority 2: For uploaded documents, try to load the original PDF file first
      const possibleFileSource = document.file || document.originalFile;
      
      console.log('=== File Source Check ===');
      console.log('document.file exists:', !!document.file);
      console.log('document.originalFile exists:', !!document.originalFile);
      console.log('possibleFileSource:', possibleFileSource);
      console.log('possibleFileSource type:', typeof possibleFileSource);
      console.log('possibleFileSource instanceof File:', possibleFileSource instanceof File);
      console.log('========================');
      
      if (possibleFileSource && !document.isTemporary) {
        try {
          console.log('Attempting to load PDF from preserved file source');
          await loadPdfFromFile(possibleFileSource);
          setIsLoading(false);
          return;
        } catch (pdfError) {
          console.error('Could not load PDF directly:', pdfError);
          // Continue to fallback
        }
      }

      // Priority 3: If we still have the URL from temporary document, try that
      if (document.url && !document.isTemporary) {
        try {
          console.log('Attempting to load PDF from URL');
          await loadPdfFromFile(document.url);
          setIsLoading(false);
          return;
        } catch (urlError) {
          console.error('Could not load PDF from URL:', urlError);
        }
      }

      // Priority 4: If all else fails, provide clear error message
      console.error('No valid PDF source found - this should not happen!');
      console.error('Available document properties:', Object.keys(document));
      console.error('Document.file type:', typeof document.file);
      console.error('Document.originalFile type:', typeof document.originalFile);
      console.error('Document.url:', document.url);
      
      setError('Could not load PDF for viewing. The file may have been lost during processing.');
      setDocumentContent('');
      setViewMode('content');

    } catch (err) {
      console.error('Error loading document:', err);
      setError('Failed to load PDF. Please try selecting the file again.');
      setDocumentContent('');
      setViewMode('content');
    } finally {
      setIsLoading(false);
    }
  };

  const loadPdfFromFile = async (fileOrUrlOrBlob) => {
    try {
      setIsLoading(true);
      setError('');
      
      let arrayBuffer;
      
      console.log('=== loadPdfFromFile Debug ===');
      console.log('Input type:', typeof fileOrUrlOrBlob);
      console.log('Is File:', fileOrUrlOrBlob instanceof File);
      console.log('Is Blob:', fileOrUrlOrBlob instanceof Blob);
      console.log('Is string:', typeof fileOrUrlOrBlob === 'string');
      console.log('Input value:', fileOrUrlOrBlob);
      console.log('=============================');
      
      // Handle File objects, URLs, and Blobs
      if (fileOrUrlOrBlob instanceof File) {
        console.log('Loading PDF from File object');
        arrayBuffer = await fileOrUrlOrBlob.arrayBuffer();
      } else if (fileOrUrlOrBlob instanceof Blob) {
        console.log('Loading PDF from Blob');
        arrayBuffer = await fileOrUrlOrBlob.arrayBuffer();
      } else if (typeof fileOrUrlOrBlob === 'string') {
        console.log('Loading PDF from URL:', fileOrUrlOrBlob);
        const response = await fetch(fileOrUrlOrBlob);
        if (!response.ok) {
          throw new Error(`Failed to fetch PDF from URL: ${response.statusText}`);
        }
        arrayBuffer = await response.arrayBuffer();
      } else {
        throw new Error('Invalid file, URL, or Blob provided');
      }
      
      // Load PDF document with error handling
      let pdfDoc;
      try {
        pdfDoc = await pdfjsLib.getDocument({ 
          data: arrayBuffer,
          // Disable worker for better compatibility
          useWorkerFetch: false,
          isEvalSupported: false,
          useSystemFonts: true
        }).promise;
      } catch (pdfError) {
        console.error('PDF parsing error:', pdfError);
        throw new Error('Failed to parse PDF file. The file may be corrupted or password protected.');
      }
      
      console.log('✅ PDF loaded successfully, pages:', pdfDoc.numPages);
      setPdfDocument(pdfDoc);
      setTotalPages(pdfDoc.numPages);
      setCurrentPage(1);
      
      // Load and render all pages
      const pdfPagesData = [];
      for (let pageNum = 1; pageNum <= Math.min(pdfDoc.numPages, 50); pageNum++) { // Limit to 50 pages for performance
        try {
          const page = await pdfDoc.getPage(pageNum);
          pdfPagesData.push(page);
        } catch (pageError) {
          console.error(`Error loading page ${pageNum}:`, pageError);
          // Continue with other pages
        }
      }
      setPdfPages(pdfPagesData);
      
      // Set view mode to show actual PDF pages
      setViewMode('pdf');
      console.log('✅ PDF viewer ready with navigation controls');
      
    } catch (err) {
      console.error('Error loading PDF file:', err);
      setError(`Failed to load PDF file: ${err.message}`);
      setDocumentContent(generateFallbackContent(document));
      setViewMode('content');
    } finally {
      setIsLoading(false);
    }
  };

  // Effect to render PDF pages when they're loaded
  useEffect(() => {
    if (pdfPages.length > 0 && viewMode === 'pdf') {
      renderPdfPage(currentPage);
    }
  }, [pdfPages, currentPage, viewMode]);

  const renderPdfPage = async (pageNumber) => {
    if (!pdfPages[pageNumber - 1] || !canvasRefs.current[pageNumber - 1]) return;

    const page = pdfPages[pageNumber - 1];
    const canvas = canvasRefs.current[pageNumber - 1];
    
    if (!canvas) {
      console.warn(`Canvas not found for page ${pageNumber}`);
      return;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      console.warn(`Canvas context not available for page ${pageNumber}`);
      return;
    }

    try {
      // Calculate scale to fit container width
      const containerWidth = canvas.parentElement?.clientWidth || 800;
      const viewport = page.getViewport({ scale: 1 });
      const scale = Math.min(containerWidth / viewport.width, 1.5); // Max scale of 1.5
      const scaledViewport = page.getViewport({ scale });

      // Set canvas dimensions
      canvas.height = scaledViewport.height;
      canvas.width = scaledViewport.width;

      // Clear the canvas before rendering
      context.clearRect(0, 0, canvas.width, canvas.height);

      // Render PDF page to canvas
      const renderContext = {
        canvasContext: context,
        viewport: scaledViewport,
      };

      await page.render(renderContext).promise;
    } catch (err) {
      console.error(`Error rendering PDF page ${pageNumber}:`, err);
      
      // Show error message on canvas
      const context = canvas.getContext('2d');
      if (context) {
        context.fillStyle = '#f8d7da';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = '#721c24';
        context.font = '16px Arial';
        context.textAlign = 'center';
        context.fillText(
          `Error rendering page ${pageNumber}`, 
          canvas.width / 2, 
          canvas.height / 2
        );
      }
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

        {!isLoading && !error && viewMode === 'pdf' && pdfPages.length > 0 && (
          <div className="pdf-viewer__pdf-content">
            <div className="pdf-viewer__pdf-page-container">
              {totalPages > 1 && (
                <div className="pdf-viewer__pdf-navigation">
                  <button 
                    onClick={goToPrevPage}
                    disabled={currentPage === 1}
                    className="pdf-viewer__pdf-nav-btn"
                  >
                    ← Previous
                  </button>
                  <span className="pdf-viewer__pdf-page-indicator">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button 
                    onClick={goToNextPage}
                    disabled={currentPage === totalPages}
                    className="pdf-viewer__pdf-nav-btn"
                  >
                    Next →
                  </button>
                </div>
              )}
              <div className="pdf-viewer__canvas-container">
                {pdfPages.map((page, index) => (
                  <canvas
                    key={index}
                    ref={el => canvasRefs.current[index] = el}
                    className={`pdf-viewer__canvas ${index + 1 === currentPage ? 'pdf-viewer__canvas--active' : 'pdf-viewer__canvas--hidden'}`}
                    style={{
                      maxWidth: '100%',
                      height: 'auto',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
                    }}
                  />
                ))}
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
