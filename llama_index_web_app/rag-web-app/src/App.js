import React, { useMemo, useCallback } from 'react';
import { Header, SidebarLayout, Icon } from './shared';
import { DocumentTools, CompactUploadButton } from './features/document-management';
import { AiPdfTools } from './features/ai-pdf';
import { useDocuments } from './features/document-management';
import { PdfToWordConverter } from './features/pdf-to-word-converter';
import './shared/styles/base.scss';
import './shared/styles/components.scss';
import './features/document-management/styles/components.scss';
import './features/ai-pdf/styles/components.scss';

function App() {
  const { documents, refreshDocuments } = useDocuments();

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
      content: <AiPdfTools documents={documents} onUploadSuccess={handleUploadSuccess} />
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
      // content: <WordToPdfConverter />
    },
    {
      label: 'Split PDF',
      icon: <Icon name='scissors' />,
      title: 'Split PDF Converter',
      // content: <Settings />
    }

  ], [documents, refreshDocuments, handleUploadSuccess]);

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
