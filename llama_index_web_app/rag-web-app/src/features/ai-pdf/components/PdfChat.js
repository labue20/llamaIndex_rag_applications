/**
 * PDF Chat Component
 * Interactive chat interface for conversing with PDF documents
 */

import React, { useState, useRef, useEffect } from 'react';
import { FileSelector, SplitLayout } from '../../../shared';
import PdfViewer from './PdfViewer';
import { usePdfChat } from '../hooks/usePdfFeatures';

const PdfChat = ({ resetTrigger }) => {
  const [inputMessage, setInputMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadedDocument, setUploadedDocument] = useState(null);
  const [isProcessingForAI, setIsProcessingForAI] = useState(false);
  const { messages, isLoading, error, sendMessage } = usePdfChat();
  const messagesEndRef = useRef(null);
  
  // Use a ref to permanently store the file to prevent loss during state updates
  const fileRef = useRef(null);

  // Handle reset trigger (when switching between tabs)
  useEffect(() => {
    if (resetTrigger > 0) {
      console.log('PdfChat reset triggered, preserving document state');
      // Don't reset document states - only reset input
      setInputMessage('');
    }
  }, [resetTrigger]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
  }, []);

  // Cleanup old URLs when uploadedDocument changes (but preserve the current one)
  useEffect(() => {
    return () => {
      // This cleanup runs when uploadedDocument changes, but we handle it carefully
      // The URL cleanup is handled elsewhere to avoid premature cleanup
    };
  }, [uploadedDocument]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || isLoading || isProcessingForAI || !uploadedDocument) return;

    try {
      // Use the document ID returned from the upload response
      const documentId = uploadedDocument?.doc_id || uploadedDocument?.id;
      
      if (!documentId) {
        throw new Error('Document ID not available. Please wait for upload to complete.');
      }
      
      await sendMessage(inputMessage.trim(), documentId);
      setInputMessage('');
    } catch (err) {
      console.error('Failed to send message:', err);
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
          <p>Select a PDF file to start chatting</p>
          <FileSelector
            onFileSelect={handleFileSelect}
            onUploadSuccess={handleFileUpload}
            onUploadError={handleUploadError}
            acceptedTypes='.pdf'
            label='Select a file'
            variant='compact'
            autoUpload={true}
            className='pdf-chat__file-selector'
          />
        </div>
      </div>
    );
  }

  // Show split-screen when document is selected/uploaded
  const chatContent = (
    <div className='pdf-chat'>
      <div className='pdf-chat__header'>
        <p className='pdf-chat__selected'>
          Chatting with: <strong>{uploadedDocument.name || 'PDF Document'}</strong>
        </p>
        {isProcessingForAI && (
          <div className='pdf-chat__processing'>
            <span className='pdf-chat__processing-icon'>⏳</span>
            <span className='pdf-chat__processing-text'>Processing document for AI chat...</span>
          </div>
        )}
      </div>

      <div className='pdf-chat__messages'>
        {isProcessingForAI ? (
          <div className='pdf-chat__empty'>
            <div className='pdf-chat__processing-state'>
              <h3>Preparing AI Chat</h3>
              <p>Your document is being processed for AI-powered conversations. This should only take a few seconds!</p>
              <div className='pdf-chat__processing-steps'>
                <div className='pdf-chat__step'>Document uploaded ✓</div>
                <div className='pdf-chat__step pdf-chat__step--active'>Quick analysis in progress...</div>
                <div className='pdf-chat__step'>Ready for chat</div>
              </div>
              <p className='pdf-chat__processing-note'>
                You can view the document on the right while processing continues. Chat will be available in seconds!
              </p>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className='pdf-chat__empty'>
            <p>Start a conversation by asking questions about your PDF!</p>
            <div className='pdf-chat__suggestions'>
              <h4>Try asking:</h4>
              <ul>
                <li>"What is this document about?"</li>
                <li>"Summarize the main points"</li>
                <li>"What are the key findings?"</li>
                <li>"Explain the methodology used"</li>
              </ul>
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <div 
              key={message.id} 
              className={`pdf-chat__message pdf-chat__message--${message.type}`}
            >
              <div className='pdf-chat__message-content'>
                {message.content}
              </div>
              <div className='pdf-chat__message-time'>
                {formatTime(message.timestamp)}
              </div>
            </div>
          ))
        )}
        
        {isLoading && !isProcessingForAI && (
          <div className='pdf-chat__message pdf-chat__message--assistant pdf-chat__message--loading'>
            <div className='pdf-chat__message-content'>
              <div className='pdf-chat__typing'>
                <span></span>
                <span></span>
                <span></span>
              </div>
              Analyzing PDF...
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {error && (
        <div className='pdf-chat__error'>
          <p>❌ {error}</p>
        </div>
      )}

      <div className='pdf-chat__input-container'>
        <form className='pdf-chat__input-form' onSubmit={handleSubmit}>
          <textarea
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder={
              isProcessingForAI 
                ? 'Please wait while document is being processed...' 
                : !uploadedDocument?.doc_id
                ? 'Document processing, please wait...'
                : 'Ask a question about your PDF...'
            }
            disabled={isLoading || isProcessingForAI || !uploadedDocument?.doc_id}
            className='pdf-chat__input-field'
            rows={3}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />
          <button
            type='submit'
            disabled={!inputMessage.trim() || isLoading || isProcessingForAI || !uploadedDocument?.doc_id}
            className='pdf-chat__send-btn'
          >
            {isLoading ? '⏳' : isProcessingForAI ? '⏳' : '📤'}
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
        onStartChat={() => {}}
        onGenerateSummary={() => {}}
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
};

export default PdfChat;
