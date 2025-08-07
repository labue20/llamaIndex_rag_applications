/**
 * AI PDF Tools Component
 * Main component for AI PDF features including chat and summarization
 */

import React, { useState } from 'react';
import PdfChat from './PdfChat';
import PdfSummary from './PdfSummary';
import PdfSelector from './PdfSelector';

const AiPdfTools = () => {
  const [activeFeature, setActiveFeature] = useState('chat'); // 'chat' or 'summary'

  return (
    <div className='ai-pdf-tools'>
      {/* PDF Selector */}
      <div className='ai-pdf-tools__selector'>
        <PdfSelector />
      </div>

      {/* Feature Tabs */}
      <div className='ai-pdf-tools__tabs'>
        <button
          className={`ai-pdf-tools__tab ${activeFeature === 'chat' ? 'ai-pdf-tools__tab--active' : ''}`}
          onClick={() => setActiveFeature('chat')}
        >
          💬 Chat with PDF
        </button>
        <button
          className={`ai-pdf-tools__tab ${activeFeature === 'summary' ? 'ai-pdf-tools__tab--active' : ''}`}
          onClick={() => setActiveFeature('summary')}
        >
          📄 Summarize PDF
        </button>
      </div>

      {/* Feature Content */}
      <div className='ai-pdf-tools__content'>
        {activeFeature === 'chat' && <PdfChat />}
        {activeFeature === 'summary' && <PdfSummary />}
      </div>
    </div>
  );
};

export default AiPdfTools;
