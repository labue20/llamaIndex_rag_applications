/**
 * PDF Chat Component
 * Interactive chat interface for conversing with PDF documents
 */

import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { FileSelector, SplitLayout, Icon } from '../../../shared';
import PdfViewer from './PdfViewer';
import MessageMarkdown from './MessageMarkdown';
import { usePdfChat } from '../hooks/usePdfFeatures';

const PdfChat = forwardRef(({ onStatusChange, onDocumentUploaded }, ref) => {
  const [inputMessage, setInputMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadedDocument, setUploadedDocument] = useState(null);
  const [isProcessingForAI, setIsProcessingForAI] = useState(false);
  const { messages, isLoading, error, sendMessage, clearChat } = usePdfChat();
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const [copiedMessageId, setCopiedMessageId] = useState(null);
  
  // Use a ref to permanently store the file to prevent loss during state updates
  const fileRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive or the assistant starts typing
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Grow the composer with its content, up to the max-height set in CSS
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [inputMessage]);

  // Cleanup temporary URLs on unmount or when uploadedDocument changes
  useEffect(() => {
    return () => {
      // Cleanup when component unmounts
      if (uploadedDocument?.url) {
        URL.revokeObjectURL(uploadedDocument.url);
      }
      // Clear file ref
      fileRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



  const askQuestion = async (question) => {
    if (!question.trim() || isLoading || isProcessingForAI || !uploadedDocument) return;

    try {
      // Use the document ID returned from the upload response
      const documentId = uploadedDocument?.doc_id || uploadedDocument?.id;
      
      if (!documentId) {
        throw new Error('Document ID not available. Please wait for upload to complete.');
      }
      
      setInputMessage('');
      await sendMessage(question.trim(), documentId);
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    askQuestion(inputMessage);
  };

  const handleCopy = async (message) => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedMessageId(message.id);
      setTimeout(() => setCopiedMessageId((id) => (id === message.id ? null : id)), 1500);
    } catch (err) {
      console.error('Failed to copy message:', err);
    }
  };

  const handleFileSelect = (file) => {
    console.log('=== File Selection Handler ===');
    console.log('File selected:', file);
    console.log('File name:', file?.name);
    console.log('File size:', file?.size);
    console.log('File type:', file?.type);
    console.log('==============================');
    
    // Clean up any existing URL before creating a new one
    if (uploadedDocument?.url) {
      URL.revokeObjectURL(uploadedDocument.url);
    }
    
    // A new document starts a new conversation
    clearChat();
    setInputMessage('');

    // Store file in both state and ref for persistence
    setSelectedFile(file);
    fileRef.current = file; // Store in ref to prevent loss
    setIsProcessingForAI(true);
    
    // Create a temporary document object for immediate preview
    const tempDocument = {
      name: file.name,
      size: file.size,
      file: file,
      url: URL.createObjectURL(file),
      isTemporary: true
    };
    
    console.log('=== Created Temporary Document ===');
    console.log('Temp document:', tempDocument);
    console.log('File stored in ref:', !!fileRef.current);
    console.log('==================================');
    
    // Show document immediately for preview
    setUploadedDocument(tempDocument);
  };

  const handleFileUpload = (result) => {
    console.log('=== File Upload Handler ===');
    console.log('Upload result:', result);
    console.log('Current selectedFile:', selectedFile);
    console.log('File in ref:', fileRef.current);
    console.log('Current uploadedDocument:', uploadedDocument);
    console.log('==============================');
    
    setIsProcessingForAI(false);
    
    // DON'T clean up the temporary URL yet - we might still need it
    // We'll clean it up later when the component unmounts
    
    // CRITICAL: Always preserve the original file for PDF rendering
    // Use the ref as the source of truth since state might get lost
    const originalFile = fileRef.current || selectedFile;
    
    // Create a new URL for the uploaded document to ensure viewing works
    const newUploadedDocument = {
      ...result,
      isTemporary: false,
      file: originalFile, // Use the file from ref (most reliable)
      originalFile: originalFile, // Also store as originalFile for clarity
      url: originalFile ? URL.createObjectURL(originalFile) : uploadedDocument?.url, // Create new URL or keep existing
      name: originalFile?.name || result.name || uploadedDocument?.name || 'Unknown PDF' // Ensure name is preserved
    };
    
    console.log('=== Setting New Uploaded Document ===');
    console.log('New document object:', newUploadedDocument);
    console.log('File preserved:', !!newUploadedDocument.file);
    console.log('Original file from ref:', !!originalFile);
    console.log('URL preserved:', !!newUploadedDocument.url);
    console.log('=====================================');
    
    setUploadedDocument(newUploadedDocument);

    // Let the rest of the app (e.g. the Document Manager list) know about the new document
    onDocumentUploaded?.(result);

    // If using ultra-fast processing, optionally trigger background indexing for better quality
    if (result.processing_mode === 'ultra-fast' && result.doc_id) {
      console.log('Triggering background indexing for better chat quality...');
      // Start background indexing (non-blocking)
      fetch(`http://localhost:5601/backgroundIndex/${result.doc_id}`, {
        method: 'POST'
      }).then(response => {
        if (response.ok) {
          console.log('Background indexing started successfully');
        }
      }).catch(error => {
        console.warn('Background indexing request failed (this is not critical):', error);
      });
    }
  };

  const handleUploadError = (error) => {
    console.error('Upload failed:', error);
    setIsProcessingForAI(false);
    
    // Clean up the temporary URL
    if (uploadedDocument?.url && uploadedDocument?.isTemporary) {
      URL.revokeObjectURL(uploadedDocument.url);
    }
    
    // Keep the file for viewing even if upload failed
    const originalFile = fileRef.current || selectedFile;
    if (originalFile) {
      // Show the document for viewing even though upload failed
      setUploadedDocument({
        name: originalFile.name,
        size: originalFile.size,
        file: originalFile,
        url: URL.createObjectURL(originalFile),
        isTemporary: true, // Mark as temporary since upload failed
        uploadError: error.message || 'Upload failed'
      });
    } else {
      // Reset to show file selector again
      setSelectedFile(null);
      setUploadedDocument(null);
    }
  };

  // Clear the conversation but keep the current document open
  const handleClearChat = () => {
    clearChat();
    setInputMessage('');
  };

  // Close the current document and return to the file selector
  const handleCloseDocument = () => {
    if (uploadedDocument?.url) {
      URL.revokeObjectURL(uploadedDocument.url);
    }
    fileRef.current = null;
    setSelectedFile(null);
    setUploadedDocument(null);
    setIsProcessingForAI(false);
    setInputMessage('');
    clearChat();
  };

  // Let the page header (ChatHeaderActions) drive these actions
  useImperativeHandle(ref, () => ({
    selectFile: handleFileSelect,
    uploadSucceeded: handleFileUpload,
    uploadFailed: handleUploadError,
    clearChat: handleClearChat,
    closeDocument: handleCloseDocument,
  }));

  const hasDocument = !!uploadedDocument;
  const hasMessages = messages.length > 0;
  const isBusy = isProcessingForAI || isLoading;
  useEffect(() => {
    onStatusChange?.({ hasDocument, hasMessages, isBusy });
  }, [onStatusChange, hasDocument, hasMessages, isBusy]);

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  // If no document is selected, show file selector
  if (!selectedFile && !uploadedDocument) {
    return (
      <div className='pdf-chat'>
        <div className='pdf-chat__upload-center'>
          <div className='pdf-chat__intro'>
            <span className='pdf-chat__intro-icon'>
              <Icon name='chat' size={24} />
            </span>
            <h3 className='pdf-chat__intro-title'>Select a PDF file to start chatting</h3>
            <p className='pdf-chat__intro-text'>
              Upload a document, then ask questions about it and get answers drawn from its content.
            </p>
          </div>
          <FileSelector
            onFileSelect={handleFileSelect}
            onUploadSuccess={handleFileUpload}
            onUploadError={handleUploadError}
            acceptedTypes='.pdf'
            label='Choose PDF File'
            variant='dropzone'
            hint='Drop your PDF here or click to browse'
            autoUpload={true}
            className='pdf-chat__file-selector'
          />
        </div>
      </div>
    );
  }

  const isReady = !!uploadedDocument?.doc_id && !isProcessingForAI;
  const status = uploadedDocument.uploadError
    ? { tone: 'error', label: 'Upload failed' }
    : isProcessingForAI || !uploadedDocument?.doc_id
    ? { tone: 'pending', label: 'Preparing' }
    : { tone: 'ready', label: 'Ready' };

  const suggestions = [
    'Summarize this document',
    'What are the key points?',
    "What's on page 1?",
    'List any important dates or amounts',
  ];

  const renderAvatar = () => (
    <span className='pdf-chat__avatar' aria-hidden='true'>
      <Icon name='sparkle' size={16} />
    </span>
  );

  // Show split-screen when document is selected/uploaded
  const chatContent = (
    <div className='pdf-chat'>
      <div className='pdf-chat__header'>
        <span className='pdf-chat__doc-icon' aria-hidden='true'>
          <Icon name='file' size={18} />
        </span>
        <div className='pdf-chat__doc-info'>
          <span className='pdf-chat__doc-label'>Chatting with</span>
          <span className='pdf-chat__doc-name' title={uploadedDocument.name}>
            {uploadedDocument.name || 'PDF Document'}
          </span>
        </div>
        <span className={`pdf-chat__status pdf-chat__status--${status.tone}`}>
          <span className='pdf-chat__status-dot' />
          {status.label}
        </span>
      </div>

      <div className='pdf-chat__messages' aria-live='polite'>
        {uploadedDocument.uploadError ? (
          <div className='pdf-chat__state'>
            <span className='pdf-chat__state-icon pdf-chat__state-icon--error'>
              <Icon name='alert' size={22} />
            </span>
            <h3>We couldn't prepare this document</h3>
            <p className='pdf-chat__state-detail'>{uploadedDocument.uploadError}</p>
            <p>You can still read it on the right, or upload it again from the header.</p>
          </div>
        ) : isProcessingForAI ? (
          <div className='pdf-chat__state'>
            <span className='pdf-chat__spinner' aria-hidden='true' />
            <h3>Preparing your document</h3>
            <p>This usually takes a few seconds. You can start reading on the right in the meantime.</p>
            <ol className='pdf-chat__steps'>
              <li className='pdf-chat__step pdf-chat__step--done'>
                <Icon name='check' size={14} /> Uploaded
              </li>
              <li className='pdf-chat__step pdf-chat__step--active'>
                <span className='pdf-chat__step-dot' /> Reading pages
              </li>
              <li className='pdf-chat__step'>
                <span className='pdf-chat__step-dot' /> Ready to chat
              </li>
            </ol>
          </div>
        ) : messages.length === 0 ? (
          <div className='pdf-chat__state'>
            <span className='pdf-chat__state-icon'>
              <Icon name='sparkle' size={22} />
            </span>
            <h3>Ask anything about this document</h3>
            <p>Answers come from the document's content. You can ask about specific pages too.</p>
            <div className='pdf-chat__chips'>
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type='button'
                  className='pdf-chat__chip'
                  onClick={() => askQuestion(suggestion)}
                  disabled={!isReady || isLoading}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <div 
              key={message.id} 
              className={`pdf-chat__message pdf-chat__message--${message.type}`}
            >
              {message.type === 'assistant' && renderAvatar()}
              <div className='pdf-chat__message-body'>
                <div className='pdf-chat__bubble'>
                  {message.type === 'assistant'
                    ? <MessageMarkdown text={message.content} />
                    : message.content}
                </div>
                {message.note && (
                  <div className='pdf-chat__message-note' role='note'>
                    <Icon name='alert' size={14} />
                    <span>{message.note}</span>
                  </div>
                )}
                <div className='pdf-chat__message-meta'>
                  <span>{formatTime(message.timestamp)}</span>
                  {message.type === 'assistant' && (
                    <button
                      type='button'
                      className='pdf-chat__copy'
                      onClick={() => handleCopy(message)}
                      aria-label='Copy answer'
                    >
                      <Icon name={copiedMessageId === message.id ? 'check' : 'copy'} size={14} />
                      {copiedMessageId === message.id ? 'Copied' : 'Copy'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
        
        {isLoading && !isProcessingForAI && (
          <div className='pdf-chat__message pdf-chat__message--assistant'>
            {renderAvatar()}
            <div className='pdf-chat__message-body'>
              <div className='pdf-chat__bubble pdf-chat__bubble--typing' aria-label='Assistant is typing'>
                <span className='pdf-chat__typing'>
                  <span></span>
                  <span></span>
                  <span></span>
                </span>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {error && (
        <div className='pdf-chat__error' role='alert'>
          <Icon name='alert' size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className='pdf-chat__composer'>
        <form className='pdf-chat__input-form' onSubmit={handleSubmit}>
          <textarea
            ref={inputRef}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder={
              isReady ? 'Ask a question about your PDF…' : 'Preparing document, please wait…'
            }
            disabled={isLoading || !isReady}
            className='pdf-chat__input-field'
            rows={1}
            aria-label='Ask a question about your PDF'
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />
          <button
            type='submit'
            disabled={!inputMessage.trim() || isLoading || !isReady}
            className='pdf-chat__send-btn'
            aria-label='Send message'
          >
            {isLoading ? <span className='pdf-chat__send-spinner' /> : <Icon name='arrowUp' size={18} />}
          </button>
        </form>
      </div>
    </div>
  );

  const leftPanel = {
    content: chatContent
  };

  const rightPanel = {
    title: 'Document Preview',
    content: (
      <PdfViewer 
        document={uploadedDocument}
        isVisible={true}
      />
    )
  };

  return (
    <SplitLayout 
      leftPanel={leftPanel}
      rightPanel={rightPanel}
      leftWidth="50%"
    />
  );
});

export default PdfChat;
