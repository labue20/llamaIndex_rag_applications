/**
 * PDF Viewer Component
 * Displays PDF content in a dedicated viewer pane with pagination
 */

import React, { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist/webpack';
import { Icon, apiFetch } from '../../../shared';

// PDF.js worker is automatically configured when using the webpack import

const PdfViewer = ({ document, isVisible }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [documentContent, setDocumentContent] = useState('');
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState('pdf'); // Default to PDF view mode
  const [currentPage, setCurrentPage] = useState(1);
  const [pages, setPages] = useState([]);
  const [totalPages, setTotalPages] = useState(0);
  const [pdfPages, setPdfPages] = useState([]); // For actual PDF pages
  const [, setPdfDocument] = useState(null);
  const canvasRefs = useRef([]);
  const renderTaskRef = useRef(null); // in-progress pdf.js render, so a new one can cancel it
  const renderIdRef = useRef(0); // only the most recent render request may draw

  // Split text previews into viewer pages, keeping line breaks: one per
  // "--- Page N ---" section when present, otherwise ~2500-character chunks
  // broken at paragraph boundaries
  const splitContentIntoPages = (content) => {
    if (!content) return [];

    const sections = content.split(/\n*(?=--- Page \d+ ---)/).filter((part) => part.trim());
    if (sections.length > 1 || /^--- Page \d+ ---/.test(content)) return sections;

    const maxChars = 2500;
    const pageArray = [];
    let current = '';
    content.split(/\n{2,}/).forEach((paragraph) => {
      if (current && current.length + paragraph.length > maxChars) {
        pageArray.push(current);
        current = '';
      }
      current += (current ? '\n\n' : '') + paragraph;
    });
    if (current) pageArray.push(current);
    return pageArray;
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

      // Priority 4: no PDF to show (a Word/text document, or an older upload
      // without its original file): show the document's text instead
      if (await loadTextPreview()) return;

      setError("A preview isn't available for this document, but you can still chat with it.");
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

  // Show the document's indexed text; returns whether it worked
  const loadTextPreview = async () => {
    const docId = document?.doc_id || document?.id;
    if (!docId) return false;
    try {
      const response = await apiFetch(`/getFullDocument/${encodeURIComponent(docId)}`);
      if (!response.ok) return false;
      const data = await response.json();
      if (!data.preview_text) return false;
      setError('');
      setDocumentContent(data.preview_text);
      setViewMode('content');
      return true;
    } catch (err) {
      console.error('Could not load text preview:', err);
      return false;
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
      setDocumentContent('');
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

    // pdf.js can't draw on a canvas that's still being drawn on; cancel any earlier render first
    const renderId = ++renderIdRef.current;
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
      await renderTaskRef.current.promise.catch(() => {});
    }
    if (renderId !== renderIdRef.current) return; // a newer request arrived while we waited

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

      const renderTask = page.render(renderContext);
      renderTaskRef.current = renderTask;
      await renderTask.promise;
    } catch (err) {
      // Superseded by a newer render; not an error
      if (err?.name === 'RenderingCancelledException') return;

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

  if (!isVisible || !document) {
    return (
      <div className="pdf-viewer pdf-viewer--empty">
        <div className="pdf-viewer__empty-state">
          <div className="pdf-viewer__empty-icon"><Icon name="file" size={26} /></div>
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
            <div className="pdf-viewer__error-icon"><Icon name="alertTriangle" size={26} /></div>
            <div className="pdf-viewer__error-message">{error}</div>
            <button 
              className="pdf-viewer__retry-button"
              onClick={loadDocumentContent}
            >
              <Icon name="refresh" size={16} /> Retry
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
