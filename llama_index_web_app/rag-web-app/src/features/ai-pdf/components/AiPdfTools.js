/**
 * AI PDF Tools Component for AI PDF features including chat, summarization, and document query
 */

import React, { useState, useEffect, useMemo } from 'react';
import PdfChat from './PdfChat';
import PdfSummary from './PdfSummary';
import DocumentQuery from './DocumentQuery';

const FEATURE_TABS = [
  { key: 'chat', label: 'Chat with PDF', component: PdfChat },
  { key: 'query', label: '🔍 Query Documents', component: DocumentQuery },
  { key: 'summary', label: '📄 Summarize PDF', component: PdfSummary }
];

const AiPdfTools = ({ documents, onUploadSuccess, activeTab, onTabChange }) => {
  const [activeFeature, setActiveFeature] = useState('chat');
  const [chatResetTrigger, setChatResetTrigger] = useState(0);

  // Update active feature when activeTab prop changes
  useEffect(() => {
    if (activeTab && FEATURE_TABS.some(tab => tab.key === activeTab)) {
      setActiveFeature(activeTab);
      // Trigger reset for chat tab when it becomes active
      if (activeTab === 'chat') {
        setChatResetTrigger(prev => prev + 1);
      }
    }
  }, [activeTab]);

  const handleTabClick = (tabKey) => {
    setActiveFeature(tabKey);
    // Trigger reset for chat tab when clicked
    if (tabKey === 'chat') {
      setChatResetTrigger(prev => prev + 1);
    }
    // Notify parent component about tab change
    if (onTabChange) {
      onTabChange(tabKey);
    }
  };

  const activeComponent = useMemo(() => {
    const tab = FEATURE_TABS.find(tab => tab.key === activeFeature);
    return tab?.component;
  }, [activeFeature]);

  const renderActiveComponent = () => {
    const Component = activeComponent;
    if (!Component) return null;

    // Pass appropriate props based on component type
    const commonProps = { documents, onUploadSuccess };
    
    // Add resetTrigger prop specifically for PdfChat
    if (Component === PdfChat) {
      return <Component {...commonProps} resetTrigger={chatResetTrigger} />;
    }
    
    return <Component {...commonProps} />;
  };

  return (
    <div className='ai-pdf-tools'>
      {/* Feature Tabs */}
      <div className='ai-pdf-tools__tabs'>
        {FEATURE_TABS.map(tab => (
          <button
            key={tab.key}
            className={`ai-pdf-tools__tab ai-pdf-tools__tab--${tab.key} ${activeFeature === tab.key ? 'ai-pdf-tools__tab--active' : ''}`}
            onClick={() => handleTabClick(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Feature Content */}
      <div className='ai-pdf-tools__content'>
        {renderActiveComponent()}
      </div>
    </div>
  );
};

export default AiPdfTools;
