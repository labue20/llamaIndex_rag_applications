/**
 * Compact Upload Button Component
 * Small upload button for header use with automatic upload
 */

import React from 'react';
import { useDocumentUpload } from '../hooks/useDocuments';

const CompactUploadButton = ({ onUploadSuccess }) => {
  const { selectFile, uploadDocument, isUploading } = useDocumentUpload();

  const changeHandler = async (event) => {
    if (event.target && event.target.files && event.target.files.length > 0) {
      const file = event.target.files[0];
      selectFile(file);
      
      // Automatically upload the file after selection
      try {
        await uploadDocument(onUploadSuccess, file);
        // Reset the input to allow selecting the same file again
        event.target.value = '';
      } catch (error) {
        console.error('Auto-upload failed:', error);
        // Reset the input on error as well
        event.target.value = '';
      }
    }
  };

  return (
    <div className='compact-upload'>
      <input
        className='compact-upload__input'
        type='file'
        name='compact-file-input'
        id='compact-file-input'
        accept='.pdf,.txt,.json,.md,.docx'
        onChange={changeHandler}
        disabled={isUploading}
      />
      <label className={`compact-upload__btn ${isUploading ? 'compact-upload__btn--uploading' : ''}`} htmlFor='compact-file-input'>
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
        <span>{isUploading ? 'Uploading...' : 'Select Files'}</span>
      </label>
    </div>
  );
};

export default CompactUploadButton;
