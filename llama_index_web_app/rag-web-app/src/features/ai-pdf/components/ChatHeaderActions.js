/**
 * Chat Header Actions
 * Toolbar shown next to the "Chat with PDF" title: load a new document, clear the chat,
 * or close the current document. Drives PdfChat through the ref passed in as chatRef.
 */

import React from 'react';
import { FileSelector } from '../../../shared';

const ChatHeaderActions = ({ chatRef, status }) => {
  const { hasDocument, hasMessages, isBusy } = status;

  return (
    <div className='page-actions'>
      <FileSelector
        onFileSelect={(file) => chatRef.current?.selectFile(file)}
        onUploadSuccess={(result) => chatRef.current?.uploadSucceeded(result)}
        onUploadError={(error) => chatRef.current?.uploadFailed(error)}
        acceptedTypes='.pdf'
        label='New document'
        variant='compact'
        autoUpload={true}
        disabled={isBusy}
        className='page-actions__upload'
      />
      <button
        type='button'
        className='page-actions__btn'
        onClick={() => chatRef.current?.clearChat()}
        disabled={!hasMessages || isBusy}
      >
        Clear chat
      </button>
      <button
        type='button'
        className='page-actions__btn'
        onClick={() => chatRef.current?.closeDocument()}
        disabled={!hasDocument || isBusy}
      >
        Close document
      </button>
    </div>
  );
};

export default ChatHeaderActions;
