/**
 * Converter Header Actions
 * Toolbar shown next to a converter page's title: load a new document or close
 * the current one. Drives the converter through the ref passed in as converterRef
 * (which exposes selectFile(file) and reset()).
 */

import React from 'react';
import FileSelector from './FileSelector';
import Icon from './Icon';

const ConverterHeaderActions = ({ converterRef, status, acceptedTypes }) => {
  const { hasFile, isBusy } = status;

  return (
    <div className='page-actions'>
      <FileSelector
        onFileSelect={(file) => converterRef.current?.selectFile(file)}
        acceptedTypes={acceptedTypes}
        label='New document'
        variant='compact'
        autoUpload={false}
        disabled={isBusy}
        className='page-actions__upload'
      />
      <button
        type='button'
        className='page-actions__btn'
        onClick={() => converterRef.current?.reset()}
        disabled={!hasFile || isBusy}
        title='Close document'
      >
        <Icon name='close' size={16} />
        <span className='page-actions__label'>Close document</span>
      </button>
    </div>
  );
};

export default ConverterHeaderActions;
