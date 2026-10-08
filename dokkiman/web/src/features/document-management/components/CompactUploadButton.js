/**
 * Compact Upload Button Component
 * "Upload files" button for the Document Manager's folder bar; uploads as soon
 * as a file is chosen and reports the result next to the button. With a folder
 * open (?folder=<id>), the new document is filed in it.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileSelector, Icon } from '../../../shared';
import { folderApi } from '../services/folderApi';

const MESSAGE_SECONDS = { success: 4, error: 10 };

const CompactUploadButton = ({ onUploadSuccess, label = 'Upload files' }) => {
  // A ref, not state: the upload starts in the same event the file is chosen
  const fileNameRef = useRef('');
  const [result, setResult] = useState(null); // { type: 'success' | 'error', text }
  const [searchParams] = useSearchParams();
  const folderId = searchParams.get('folder');

  // Hide the message after a while
  useEffect(() => {
    if (!result) return undefined;
    const timer = setTimeout(() => setResult(null), MESSAGE_SECONDS[result.type] * 1000);
    return () => clearTimeout(timer);
  }, [result]);

  return (
    <div className='page-actions'>
      <FileSelector
        onFileSelect={(file) => {
          fileNameRef.current = file.name;
          setResult(null);
        }}
        onUploadSuccess={async (uploadResult) => {
          const name = fileNameRef.current || 'your file';
          if (folderId && uploadResult?.doc_id) {
            try {
              await folderApi.move(folderId, { documentIds: [uploadResult.doc_id] });
            } catch (err) {
              setResult({ type: 'error', text: `Uploaded ${name}, but couldn’t put it in this folder: ${err.message}` });
              onUploadSuccess?.(uploadResult);
              return;
            }
          }
          setResult({ type: 'success', text: `Uploaded ${name}` });
          onUploadSuccess?.(uploadResult);
        }}
        onUploadError={(error) => {
          console.error('Upload failed:', error);
          setResult({ type: 'error', text: error.message || 'Upload failed. Please try again.' });
        }}
        acceptedTypes='.pdf,.txt,.json,.md,.docx'
        label={label}
        variant='compact'
        autoUpload={true}
        className='page-actions__upload'
      />
      {result && (
        <span
          className={`page-actions__message page-actions__message--${result.type}`}
          role={result.type === 'error' ? 'alert' : 'status'}
        >
          <Icon name={result.type === 'error' ? 'alert' : 'checkCircle'} size={15} />
          {result.text}
        </span>
      )}
    </div>
  );
};

export default CompactUploadButton;
