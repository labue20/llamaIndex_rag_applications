/**
 * PDF Summary Component
 * Generates and displays summaries of PDF documents
 */

import React, { useState } from 'react';
import { usePdfSummary } from '../hooks/usePdfFeatures';
import DocumentScanner from './DocumentScanner';
import { getPdfDisplayName, formatDate } from '../utils/helpers';

const PdfSummary = ({ documents }) => {
  const [selectedPdfId, setSelectedPdfId] = useState('');
  const [summaryType, setSummaryType] = useState('overview');
  const [showScanner, setShowScanner] = useState(false);
  const [documentToScan, setDocumentToScan] = useState(null);
  const {
    summary,
    isGenerating,
    error,
    generateSummary,
    clearSummary,
  } = usePdfSummary();

  const summaryTypes = [
    { value: 'overview', label: '📋 Overview', description: 'Brief high-level summary' },
    { value: 'detailed', label: '📖 Detailed', description: 'Comprehensive analysis' },
    { value: 'bullet-points', label: '🔹 Key Points', description: 'Main points in bullet format' },
  ];

  const handleGenerate = async () => {
    if (!selectedPdfId) return;
    
    try {
      await generateSummary(selectedPdfId, summaryType);
    } catch (err) {
      console.error('Failed to generate summary:', err);
    }
  };

  const getSelectedPdf = () => {
    return documents?.find(doc => doc.id === selectedPdfId);
  };

  const handleScanDocument = (document) => {
    setDocumentToScan(document);
    setShowScanner(true);
  };

  const handleCloseScanner = () => {
    setShowScanner(false);
    setDocumentToScan(null);
  };

  const pdfDocuments = documents?.filter(doc => 
    doc.name?.toLowerCase().endsWith('.pdf') || doc.type === 'application/pdf'
  ) || [];

  return (
    <div className='pdf-summary'>
      <div className='pdf-summary__header'>
        <h3>📄 PDF Summarization</h3>
      </div>

      <div className='pdf-summary__selection'>
        <label htmlFor='pdf-select' className='pdf-summary__label'>
          📄 Select PDF to summarize:
        </label>
        <select
          id='pdf-select'
          value={selectedPdfId}
          onChange={(e) => setSelectedPdfId(e.target.value)}
          className='pdf-summary__selector'
        >
          <option value=''>Choose a PDF...</option>
          {documents?.map((doc) => (
            <option key={doc.id} value={doc.id}>
              {getPdfDisplayName(doc)}
            </option>
          ))}
        </select>
        
        {getSelectedPdf() && (
          <p className='pdf-summary__selected'>
            Document: <strong>{getPdfDisplayName(getSelectedPdf())}</strong>
          </p>
        )}
      </div>

      <div className='pdf-summary__controls'>
        <div className='pdf-summary__type-selector'>
          <label className='pdf-summary__label'>
            <strong>Summary Type:</strong>
          </label>
          <div className='pdf-summary__type-options'>
            {summaryTypes.map((type) => (
              <label key={type.value} className='pdf-summary__radio-option'>
                <input
                  type='radio'
                  value={type.value}
                  checked={summaryType === type.value}
                  onChange={(e) => setSummaryType(e.target.value)}
                  disabled={isGenerating}
                />
                <span className='pdf-summary__radio-label'>
                  {type.label}
                  <small>{type.description}</small>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className='pdf-summary__actions'>
          <button
            onClick={handleGenerate}
            disabled={!selectedPdfId || isGenerating}
            className='pdf-summary__generate-btn'
          >
            {isGenerating ? '⏳ Generating...' : '✨ Generate Summary'}
          </button>
          
          {summary && (
            <button
              onClick={clearSummary}
              disabled={isGenerating}
              className='pdf-summary__clear-btn'
            >
              🗑️ Clear
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className='pdf-summary__error'>
          <p>❌ {error}</p>
        </div>
      )}

      {isGenerating && (
        <div className='pdf-summary__loading'>
          <div className='pdf-summary__loader'>
            <div className='pdf-summary__spinner'></div>
            <p>Analyzing PDF and generating {summaryType} summary...</p>
          </div>
        </div>
      )}

      {summary && !isGenerating && (
        <div className='pdf-summary__result'>
          <div className='pdf-summary__result-header'>
            <h4>📋 {summaryTypes.find(t => t.value === summary.type)?.label} Summary</h4>
            <div className='pdf-summary__result-meta'>
              <span>Generated: {formatDate(summary.generatedAt)}</span>
              <span>Word count: ~{summary.wordCount}</span>
            </div>
          </div>

          <div className='pdf-summary__content'>
            <div className='pdf-summary__main-content'>
              <h5>Summary:</h5>
              <p>{summary.content}</p>
            </div>

            {summary.keyPoints && summary.keyPoints.length > 0 && (
              <div className='pdf-summary__key-points'>
                <h5>Key Points:</h5>
                <ul>
                  {summary.keyPoints.map((point, index) => (
                    <li key={index}>{point}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className='pdf-summary__actions'>
            <button className='pdf-summary__export-btn'>
              📥 Export Summary
            </button>
            <button className='pdf-summary__share-btn'>
              🔗 Share
            </button>
          </div>
        </div>
      )}

      {!summary && !isGenerating && !error && selectedPdfId && (
        <div className='pdf-summary__empty'>
          <div className='pdf-summary__empty-content'>
            <h4>Ready to summarize!</h4>
            <p>Choose your preferred summary type and click "Generate Summary" to analyze your PDF.</p>
            <div className='pdf-summary__features'>
              <h5>What you'll get:</h5>
              <ul>
                <li>🎯 Main themes and topics</li>
                <li>📊 Key insights and findings</li>
                <li>🔍 Important details and data</li>
                <li>💡 Actionable takeaways</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Available Documents for Scanning */}
      {pdfDocuments.length > 0 && (
        <div className='pdf-summary__documents'>
          <h4 className='pdf-summary__documents-title'>📄 Available Documents for Preview</h4>
          <div className='pdf-summary__documents-list'>
            {pdfDocuments.map(doc => (
              <div key={doc.id} className='pdf-summary__document-item'>
                <span className='pdf-summary__document-name'>{doc.name}</span>
                <button 
                  className='pdf-summary__scan-button'
                  onClick={() => handleScanDocument(doc)}
                >
                  🔍 Scan & Preview
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Document Scanner Modal */}
      <DocumentScanner
        document={documentToScan}
        isVisible={showScanner}
        onClose={handleCloseScanner}
      />
    </div>
  );
};

export default PdfSummary;
