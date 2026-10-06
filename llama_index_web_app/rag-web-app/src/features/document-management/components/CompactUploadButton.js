/**
 * Compact Upload Button Component
 * "Upload files" button for the Document Manager header; uploads as soon as a
 * file is chosen. Styled like the other page header toolbars.
 */

import React from 'react';
import { FileSelector } from '../../../shared';

const CompactUploadButton = ({ onUploadSuccess }) => (
  <div className='page-actions'>
    <FileSelector
      onUploadSuccess={onUploadSuccess}
      onUploadError={(error) => console.error('Upload failed:', error)}
      acceptedTypes='.pdf,.txt,.json,.md,.docx'
      label='Upload files'
      variant='compact'
      autoUpload={true}
      className='page-actions__upload'
    />
  </div>
);

export default CompactUploadButton;
