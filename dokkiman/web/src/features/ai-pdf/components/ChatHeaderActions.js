/**
 * Chat Header Actions
 * Toolbar shown next to the "Chat with PDF" title: load a new document, clear the chat,
 * or close the current document. Drives PdfChat through the ref passed in as chatRef.
 */

import React from 'react';
import { FileSelector, Icon } from '../../../shared';

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
        title='Clear chat'
      >
        <Icon name='eraser' size={16} />
        <span className='page-actions__label'>Clear chat</span>
      </button>
      <button
        type='button'
        className='page-actions__btn'
        onClick={() => chatRef.current?.closeDocument()}
        disabled={!hasDocument || isBusy}
        title='Close document'
      >
        <Icon name='close' size={16} />
        <span className='page-actions__label'>Close document</span>
      </button>
    </div>
  );
};

export default ChatHeaderActions;
