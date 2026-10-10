/**
 * Centralized File Selector Component
 * Provides unified file selection and upload functionality across the application
 */

import React, { useState } from 'react';
import { useDocumentUpload } from '../../features/document-management/hooks/useDocuments';
import Icon from './Icon';

const FileSelector = ({ 
  onUploadSuccess, 
  onUploadError,
  onFileSelect, 
  acceptedTypes = '.pdf,.txt,.json,.md,.docx',
  label = 'Select Files',
  variant = 'default', // 'default', 'compact', 'inline', 'dropzone'
  hint = '',
  disabled = false,
  autoUpload = true,
  multiple = false,
  className = '',
  // Extra buttons shown beside the dropzone's main button (e.g. Document Manager)
  extraActions = null
}) => {
  const { selectFile, uploadDocument, isUploading } = useDocumentUpload();
  const [selectedFile, setSelectedFile] = useState(null);
  const [inputId] = useState(`file-selector-input-${Math.random().toString(36).substr(2, 9)}`);

  const handleFileChange = async (event) => {
    if (event.target && event.target.files && event.target.files.length > 0) {
      const file = event.target.files[0];
      event.target.value = ''; // so choosing the same file again still fires onChange
      setSelectedFile(file);
      selectFile(file);
      
      // Notify parent component about file selection IMMEDIATELY
      if (onFileSelect) {
        onFileSelect(file);
      }
      
      // Automatically upload if enabled - but don't wait for it to complete
      if (autoUpload) {
        // Start upload in background without blocking UI
        uploadDocument(onUploadSuccess, file).then(() => {
          // Reset the input after successful upload
          event.target.value = '';
          setSelectedFile(null);
          console.log('Background upload completed successfully');
        }).catch((error) => {
          console.error('Background upload failed:', error);
          // Reset the input on error as well
          event.target.value = '';
          setSelectedFile(null);
          
          // Notify parent component about the error
          if (onUploadError) {
            onUploadError(error);
          }
        });
      }
    }
  };

  const handleManualUpload = async () => {
    if (selectedFile && !autoUpload) {
      try {
        await uploadDocument(onUploadSuccess, selectedFile);
        setSelectedFile(null);
      } catch (error) {
        console.error('Manual upload failed:', error);
        if (onUploadError) {
          onUploadError(error);
        }
      }
    }
  };

  const getVariantClass = () => {
    switch (variant) {
      case 'compact':
        return 'file-selector--compact';
      case 'inline':
        return 'file-selector--inline';
      case 'dropzone':
        return 'file-selector--dropzone';
      default:
        return 'file-selector--default';
    }
  };

  // Dashed drop area; the transparent input covers it, so clicking or dropping a file both work
  if (variant === 'dropzone') {
    return (
      <div className={`file-selector file-selector--dropzone ${className}`}>
        <input
          className='file-selector__dropzone-input'
          type='file'
          accept={acceptedTypes}
          onChange={handleFileChange}
          disabled={isUploading || disabled}
          multiple={multiple}
        />
        <div className='file-selector__dropzone-actions'>
          <span className='file-selector__dropzone-btn'>{isUploading ? 'Uploading...' : label}</span>
          {extraActions}
        </div>
        {hint && <p className='file-selector__dropzone-hint'>{hint}</p>}
      </div>
    );
  }

  return (
    <div className={`file-selector ${getVariantClass()} ${className}`}>
      <input
        className='file-selector__input'
        type='file'
        name='file-selector-input'
        id={inputId}
        accept={acceptedTypes}
        onChange={handleFileChange}
        disabled={isUploading || disabled}
        multiple={multiple}
      />
      <label 
        className={`file-selector__btn ${isUploading ? 'file-selector__btn--uploading' : ''} ${disabled ? 'file-selector__btn--disabled' : ''}`} 
        htmlFor={inputId}
      >
        {variant === 'compact' && <Icon name='upload' size={18} />}
        <span className='file-selector__label'>{isUploading ? 'Uploading...' : label}</span>
      </label>
      
      {selectedFile && !autoUpload && onUploadSuccess && (
        <div className='file-selector__selected'>
          <span className='file-selector__filename'>{selectedFile.name}</span>
          <button 
            className='file-selector__upload-btn'
            onClick={handleManualUpload}
            disabled={isUploading}
          >
            Upload
          </button>
        </div>
      )}
    </div>
  );
};

export default FileSelector;
