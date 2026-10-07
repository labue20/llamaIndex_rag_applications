/**
 * AI PDF Tools Component for chatting with PDF documents
 */

import React, { forwardRef } from 'react';
import PdfChat from './PdfChat';

const AiPdfTools = forwardRef(({ onStatusChange, onDocumentUploaded, isGuest = false }, ref) => {
  return (
    <div className='ai-pdf-tools'>
      <div className='ai-pdf-tools__content'>
        <PdfChat ref={ref} onStatusChange={onStatusChange} onDocumentUploaded={onDocumentUploaded} isGuest={isGuest} />
      </div>
    </div>
  );
});

export default AiPdfTools;
