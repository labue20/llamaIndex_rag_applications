/**
 * Centralized File Selector Component
 * Provides unified file selection and upload functionality across the application
 */

import React, { useState } from 'react';
import { useDocumentUpload } from '../../features/document-management/hooks/useDocuments';

const FileSelector = ({ 
  onUploadSuccess, 
  onUploadError,
  onFileSelect, 
  acceptedTypes = '.pdf,.txt,.json,.md,.docx',
  label = 'Select Files',
  variant = 'default', // 'default', 'compact', 'inline'
  autoUpload = true,
  multiple = false,
  className = ''
}) => {
  const { selectFile, uploadDocument, isUploading } = useDocumentUpload();
  const [selectedFile, setSelectedFile] = useState(null);
  const [inputId] = useState(`file-selector-input-${Math.random().toString(36).substr(2, 9)}`);

  const handleFileChange = async (event) => {
    if (event.target && event.target.files && event.target.files.length > 0) {
      const file = event.target.files[0];
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
      default:
        return 'file-selector--default';
    }
  };

  return (
    <div className={`file-selector ${getVariantClass()} ${className}`}>
      <input
        className='file-selector__input'
        type='file'
        name='file-selector-input'
        id={inputId}
        accept={acceptedTypes}
        onChange={handleFileChange}
        disabled={isUploading}
        multiple={multiple}
      />
      <label 
        className={`file-selector__btn ${isUploading ? 'file-selector__btn--uploading' : ''}`} 
        htmlFor={inputId}
      >
        {variant === 'compact' && (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M12 15V3M12 3L16 7M12 3L8 7M2 17L2 19C2 20.1046 2.89543 21 4 21L20 21C21.1046 21 22 20.1046 22 19L22 17"
              stroke="#3b82f6"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
        <span>{isUploading ? 'Uploading...' : label}</span>
      </label>
      
      {selectedFile && !autoUpload && (
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
