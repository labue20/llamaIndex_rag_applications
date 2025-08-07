/**
 * Document Management Feature Exports
 * Centralized exports for document management functionality
 */

export { default as DocumentTools } from './components/DocumentTools';
export { default as DocumentUploader } from './components/DocumentUploader';
export { default as DocumentViewer } from './components/DocumentViewer';
export { default as CompactUploadButton } from './components/CompactUploadButton';
export { useDocuments, useDocumentUpload } from './hooks/useDocuments';

// Services
export { documentApi } from './services/documentApi';
