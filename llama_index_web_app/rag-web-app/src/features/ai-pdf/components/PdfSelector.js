/**
 * PDF Selector Component
 * Allows users to select a PDF from uploaded documents
 */

import React from 'react';
import { useDocuments } from '../../document-management/hooks/useDocuments';

const PdfSelector = () => {
  const { documents, isLoading, error } = useDocuments();
  
  // Filter only PDF documents
  const pdfDocuments = documents.filter(doc => 
    doc.name?.toLowerCase().endsWith('.pdf') || doc.type === 'application/pdf'
  );

  if (isLoading) {
    return (
      <div className='pdf-selector pdf-selector--loading'>
        <p>Loading documents...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className='pdf-selector pdf-selector--error'>
        <p>Error loading documents: {error}</p>
      </div>
    );
  }

  if (pdfDocuments.length === 0) {
    return (
      <div className='pdf-selector pdf-selector--empty'>
        <p>No PDF documents found. Please upload a PDF document first.</p>
      </div>
    );
  }

  return (
    <div className='pdf-selector'>
      <label className='pdf-selector__label'>
        <strong>Select PDF Document:</strong>
      </label>
      <select className='pdf-selector__dropdown' defaultValue="">
        <option value="" disabled>Choose a PDF document...</option>
        {pdfDocuments.map((doc, index) => (
          <option key={doc.id || index} value={doc.id || index}>
            {doc.name} {doc.size && `(${(doc.size / 1024 / 1024).toFixed(2)} MB)`}
          </option>
        ))}
      </select>
    </div>
  );
};

export default PdfSelector;
