import React, { useEffect, useMemo, useCallback, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Header, Footer, SidebarLayout, Icon, ConverterHeaderActions } from './shared';
import { DocumentTools } from './features/document-management';
import { AiPdfTools, ChatHeaderActions } from './features/ai-pdf';
import { documentApi, useDocuments } from './features/document-management';
import { PdfToWordConverter } from './features/pdf-to-word-converter';
import { WordToPdfConverter } from './features/word-to-pdf-converter';
import { SplitPdf } from './features/split-pdf';
import { CompressPdf } from './features/compress-pdf';
import { EditPdf } from './features/edit-pdf';
import { ESign, sendForSignature } from './features/e-sign';
import { useAuth, GuestAccountPrompt } from './features/auth';
import { APP_SECTION_SLUGS, RENAMED_SLUGS, appPath } from './routes';
import './shared/styles/base.scss';
import './shared/styles/components.scss';
import './features/document-management/styles/components.scss';
import './features/ai-pdf/styles/components.scss';
// Phone/tablet overrides: must come after the other stylesheets
import './shared/styles/responsive.scss';

function App() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  // Visitors without an account can try the tools as guests
  const isGuest = !user;
  const { documents, refreshDocuments } = useDocuments({ enabled: !isGuest });
  const chatRef = useRef(null);
  const [chatStatus, setChatStatus] = useState({ hasDocument: false, hasMessages: false, isBusy: false });
  const pdfToWordRef = useRef(null);
  const [pdfToWordStatus, setPdfToWordStatus] = useState({ hasFile: false, isBusy: false });
  const wordToPdfRef = useRef(null);
  const [wordToPdfStatus, setWordToPdfStatus] = useState({ hasFile: false, isBusy: false });
  const splitPdfRef = useRef(null);
  const [splitPdfStatus, setSplitPdfStatus] = useState({ hasFile: false, isBusy: false });
  const compressPdfRef = useRef(null);
  const [compressPdfStatus, setCompressPdfStatus] = useState({ hasFile: false, isBusy: false });
  const editPdfRef = useRef(null);
  const [editPdfStatus, setEditPdfStatus] = useState({ hasFile: false, isBusy: false });
  const eSignRef = useRef(null);
  const [eSignStatus, setESignStatus] = useState({ hasFile: false, isBusy: false });

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
      shortLabel: 'Documents',
      title: 'My Documents',
      icon: <Icon name='folder' />,
      content: isGuest
        ? <GuestAccountPrompt />
        : <DocumentTools documents={documents} refreshDocuments={refreshDocuments} onUploadSuccess={handleUploadSuccess} />,
      // Upload files is in the folder bar, next to New folder
      headerAction: null
    },
    {
      label: 'AI PDF',
      shortLabel: 'Chat',
      icon: <Icon name='chat' />,
      title: 'Chat with PDF',
      content: (
        <AiPdfTools
          ref={chatRef}
          onStatusChange={setChatStatus}
          onDocumentUploaded={isGuest ? undefined : handleUploadSuccess}
          isGuest={isGuest}
        />
      ),
      headerAction: <ChatHeaderActions chatRef={chatRef} status={chatStatus} />
    },
    {
      label: 'PDF to Word',
      shortLabel: 'To Word',
      icon: <Icon name='fileToWord' />,
      title: 'PDF to Word Converter',
      content: <PdfToWordConverter ref={pdfToWordRef} onStatusChange={setPdfToWordStatus} allowDocumentManager={!isGuest} />,
      headerAction: (
        <ConverterHeaderActions converterRef={pdfToWordRef} status={pdfToWordStatus} acceptedTypes='.pdf' />
      )
    },

    {
      label: 'Word to PDF',
      shortLabel: 'To PDF',
      icon: <Icon name='fileToPdf' />,
      title: 'Word to PDF Converter',
      content: <WordToPdfConverter ref={wordToPdfRef} onStatusChange={setWordToPdfStatus} allowDocumentManager={!isGuest} />,
      headerAction: (
        <ConverterHeaderActions converterRef={wordToPdfRef} status={wordToPdfStatus} acceptedTypes='.docx' />
      )
    },
    {
      label: 'Split PDF',
      shortLabel: 'Split',
      icon: <Icon name='scissors' />,
      title: 'Split PDF Converter',
      content: <SplitPdf ref={splitPdfRef} onStatusChange={setSplitPdfStatus} allowDocumentManager={!isGuest} />,
      headerAction: (
        <ConverterHeaderActions converterRef={splitPdfRef} status={splitPdfStatus} acceptedTypes='.pdf' />
      )
    },
    {
      label: 'Compress PDF',
      shortLabel: 'Compress',
      icon: <Icon name='compress' />,
      title: 'Compress PDF',
      content: <CompressPdf ref={compressPdfRef} onStatusChange={setCompressPdfStatus} allowDocumentManager={!isGuest} />,
      headerAction: (
        <ConverterHeaderActions converterRef={compressPdfRef} status={compressPdfStatus} acceptedTypes='.pdf' />
      )
    },
    {
      label: 'Edit PDF',
      shortLabel: 'Edit',
      icon: <Icon name='edit' />,
      title: 'Edit PDF',
      content: (
        <EditPdf
          ref={editPdfRef}
          onStatusChange={setEditPdfStatus}
          allowDocumentManager={!isGuest}
          // Accounts only: keep the result, or send it for signature
          onSaveToDocuments={isGuest ? undefined : async (file) => {
            await documentApi.uploadDocument(file);
            handleUploadSuccess();
          }}
          onSendForSignature={isGuest ? undefined : (file) => {
            sendForSignature(file);
            navigate(appPath('e-sign'));
          }}
        />
      ),
      headerAction: (
        <ConverterHeaderActions converterRef={editPdfRef} status={editPdfStatus} acceptedTypes='.pdf' />
      )
    },
    {
      label: 'E-Sign',
      shortLabel: 'E-Sign',
      icon: <Icon name='pen' />,
      title: 'E-Sign',
      content: <ESign ref={eSignRef} onStatusChange={setESignStatus} allowDocumentManager={!isGuest} isGuest={isGuest} />,
      headerAction: (
        <ConverterHeaderActions converterRef={eSignRef} status={eSignStatus} acceptedTypes='.pdf' />
      )
    }

  ], [documents, refreshDocuments, handleUploadSuccess, chatStatus, pdfToWordStatus, wordToPdfStatus, splitPdfStatus, compressPdfStatus, editPdfStatus, eSignStatus, isGuest, navigate]);

  // The section shown comes from the address: /app/<slug>
  const activeIndex = APP_SECTION_SLUGS.indexOf(location.pathname.split('/')[2] || '');

  // /app or an unknown /app/... address: go to the default section (or where it moved)
  const slug = location.pathname.split('/')[2] || '';
  useEffect(() => {
    if (activeIndex === -1) {
      navigate(appPath(RENAMED_SLUGS[slug] || (isGuest ? 'chat' : 'documents')), { replace: true });
    }
  }, [activeIndex, slug, isGuest, navigate]);

  // Name the browser tab after the current tool
  const activeTitle = sections[Math.max(activeIndex, 0)].title;
  useEffect(() => {
    document.title = `${activeTitle} · Dokkiman`;
  }, [activeTitle]);

  return (
    <div className='app'>
      <Header />
      <div className='app-container'>
        <SidebarLayout
          sections={sections}
          activeSection={Math.max(activeIndex, 0)}
          onSectionChange={(index) => navigate(appPath(APP_SECTION_SLUGS[index]))}
          footer={<Footer />}
        />
      </div>
    </div>
  );
}

export default App;
