/**
 * AI PDF Tools Component for chatting with PDF documents
 */

import React, { forwardRef } from 'react';
import PdfChat from './PdfChat';

const AiPdfTools = forwardRef(({ onStatusChange }, ref) => {
  return (
    <div className='ai-pdf-tools'>
      <div className='ai-pdf-tools__content'>
        <PdfChat ref={ref} onStatusChange={onStatusChange} />
      </div>
    </div>
  );
});

export default AiPdfTools;
