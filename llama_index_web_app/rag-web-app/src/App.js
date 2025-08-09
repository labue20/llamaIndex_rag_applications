import React, { useState, useMemo, useCallback } from 'react';
import { Header, SidebarLayout } from './shared';
import { DocumentTools, CompactUploadButton } from './features/document-management';
import { AiPdfTools } from './features/ai-pdf';
import { useDocuments } from './features/document-management';
import './shared/styles/base.scss';
import './shared/styles/components.scss';
import './features/document-management/styles/components.scss';
import './features/ai-pdf/styles/components.scss';

function App() {
  const { documents, refreshDocuments } = useDocuments();
  const [aiPdfActiveTab, setAiPdfActiveTab] = useState('chat');

  const handleUploadSuccess = useCallback(async (result) => {
    console.log('Upload successful, refreshing documents...', result);
    
    // Immediate refresh
    console.log('Calling immediate refreshDocuments...');
    refreshDocuments();
    
    // Also schedule a delayed refresh to catch any server-side processing delays
    setTimeout(() => {
      console.log('Calling delayed refreshDocuments...');
      refreshDocuments();
    }, 2000);
  }, [refreshDocuments]);

  const handleAiPdfSubItemClick = useCallback((subIndex) => {
    console.log('handleAiPdfSubItemClick called with subIndex:', subIndex);
    const tabs = ['chat', 'summary'];
    const selectedTab = tabs[subIndex];
    console.log('Setting aiPdfActiveTab to:', selectedTab);
    setAiPdfActiveTab(selectedTab);
  }, []);

  const handleAiPdfTabChange = useCallback((tabKey) => {
    console.log('handleAiPdfTabChange called with tabKey:', tabKey);
    setAiPdfActiveTab(tabKey);
  }, []);

  // Dynamic title based on active AI PDF tab
  const getAiPdfTitle = useCallback(() => {
    console.log('getAiPdfTitle called with aiPdfActiveTab:', aiPdfActiveTab);
    switch (aiPdfActiveTab) {
      case 'chat':
        return 'Chat with PDF';
      case 'summary':
        return 'Summarize';
      default:
        console.log('Unknown aiPdfActiveTab, defaulting to Chat with PDF');
        return 'Chat with PDF';
    }
  }, [aiPdfActiveTab]);

  const sections = useMemo(() => [
    {
      label: 'Document Manager',
      title: 'My Documents',
      icon: '🗂️',
      content: <DocumentTools documents={documents} refreshDocuments={refreshDocuments} />,
      headerAction: <CompactUploadButton onUploadSuccess={handleUploadSuccess} />
    },
    {
      label: 'AI PDF',
      title: getAiPdfTitle(),
      content: <AiPdfTools documents={documents} onUploadSuccess={handleUploadSuccess} activeTab={aiPdfActiveTab} onTabChange={handleAiPdfTabChange} />,
      subItems: [
        {
          label: 'Chat with PDF',
          icon: '💬'
        },
        {
          label: 'Summarize',
          icon: '📄'
        }
      ],
      onSubItemClick: handleAiPdfSubItemClick
    }
  ], [documents, refreshDocuments, handleUploadSuccess, aiPdfActiveTab, handleAiPdfSubItemClick, handleAiPdfTabChange, getAiPdfTitle]);

  return (
    <div className='app'>
      <Header />
      <div className='app-container'>
        <SidebarLayout sections={sections} defaultSection={0} />
      </div>
    </div>
  );
}

export default App;
