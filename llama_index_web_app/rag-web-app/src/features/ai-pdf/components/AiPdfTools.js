/**
 * AI PDF Tools Component for chatting with PDF documents
 */

import React from 'react';
import PdfChat from './PdfChat';

const AiPdfTools = ({ documents, onUploadSuccess }) => {
  return (
    <div className='ai-pdf-tools'>
      <div className='ai-pdf-tools__content'>
        <PdfChat documents={documents} onUploadSuccess={onUploadSuccess} />
      </div>
    </div>
  );
};

export default AiPdfTools;
