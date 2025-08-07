/**
 * PDF Summary Component
 * Generates and displays summaries of PDF documents
 */

import React from 'react';
import { usePdfSummary } from '../hooks/usePdfFeatures';

const PdfSummary = () => {
  const {
    summary,
    isGenerating,
    error,
    selectedPdf,
    summaryType,
    generateSummary,
    clearSummary,
    setSummaryType,
  } = usePdfSummary();

  const summaryTypes = [
    { value: 'overview', label: '📋 Overview', description: 'Brief high-level summary' },
    { value: 'detailed', label: '📖 Detailed', description: 'Comprehensive analysis' },
    { value: 'bullet-points', label: '🔹 Key Points', description: 'Main points in bullet format' },
  ];

  const handleGenerate = async () => {
    try {
      await generateSummary();
    } catch (err) {
      console.error('Failed to generate summary:', err);
    }
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className='pdf-summary'>
      <div className='pdf-summary__header'>
        <h3>📄 PDF Summarization</h3>
        {selectedPdf ? (
          <p className='pdf-summary__selected'>
            Document: <strong>{selectedPdf.name}</strong>
          </p>
        ) : (
          <p className='pdf-summary__no-selection'>
            Please select a PDF document above to generate a summary
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
            disabled={!selectedPdf || isGenerating}
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

      {!summary && !isGenerating && !error && selectedPdf && (
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
    </div>
  );
};

export default PdfSummary;
