import React, { useMemo, useCallback, useRef, useState } from 'react';
import { Header, Footer, SidebarLayout, Icon } from './shared';
import { DocumentTools, CompactUploadButton } from './features/document-management';
import { AiPdfTools, ChatHeaderActions } from './features/ai-pdf';
import { useDocuments } from './features/document-management';
import { PdfToWordConverter } from './features/pdf-to-word-converter';
import { WordToPdfConverter } from './features/word-to-pdf-converter';
import { SplitPdf } from './features/split-pdf';
import './shared/styles/base.scss';
import './shared/styles/components.scss';
import './features/document-management/styles/components.scss';
import './features/ai-pdf/styles/components.scss';

function App() {
  const { documents, refreshDocuments } = useDocuments();
  const chatRef = useRef(null);
  const [chatStatus, setChatStatus] = useState({ hasDocument: false, hasMessages: false, isBusy: false });

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

  const sections = useMemo(() => [
    {
      label: 'Document Manager',
      title: 'My Documents',
      icon: <Icon name='folder' />,
      content: <DocumentTools documents={documents} refreshDocuments={refreshDocuments} />,
      headerAction: <CompactUploadButton onUploadSuccess={handleUploadSuccess} />
    },
    {
      label: 'AI PDF',
      icon: <Icon name='chat' />,
      title: 'Chat with PDF',
      content: <AiPdfTools ref={chatRef} onStatusChange={setChatStatus} />,
      headerAction: <ChatHeaderActions chatRef={chatRef} status={chatStatus} />
    },
    {
      label: 'PDF to Word',
      icon: <Icon name='fileToWord' />,
      title: 'PDF to Word Converter',
      content: <PdfToWordConverter />
    },

    {
      label: 'Word to PDF',
      icon: <Icon name='fileToPdf' />,
      title: 'Word to PDF Converter',
      content: <WordToPdfConverter />
    },
    {
      label: 'Split PDF',
      icon: <Icon name='scissors' />,
      title: 'Split PDF Converter',
      content: <SplitPdf />
    }

  ], [documents, refreshDocuments, handleUploadSuccess, chatStatus]);

  return (
    <div className='app'>
      <Header />
      <div className='app-container'>
        <SidebarLayout sections={sections} defaultSection={0} footer={<Footer />} />
      </div>
    </div>
  );
}

export default App;
