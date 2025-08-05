/**
 * Document Management Hooks
 * Custom React hooks for document-related state management and operations
 */

import { useState, useEffect, useCallback } from 'react';
import { documentApi } from '../services/documentApi';

/**
 * Hook for managing document list and operations
 * @returns {Object} Document state and operations
 */
export const useDocuments = () => {
  const [documents, setDocuments] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Fetch documents from the server
   */
  const fetchDocuments = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const fetchedDocuments = await documentApi.fetchDocuments();
      setDocuments(fetchedDocuments);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching documents:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Delete a document
   * @param {string} documentId - Document ID to delete
   */
  const deleteDocument = useCallback(async (documentId) => {
    try {
      await documentApi.deleteDocument(documentId);
      setDocuments(prev => prev.filter(doc => doc.id !== documentId));
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  /**
   * Refresh the document list
   */
  const refreshDocuments = useCallback(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Fetch documents on mount
  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  return {
    documents,
    isLoading,
    error,
    fetchDocuments,
    deleteDocument,
    refreshDocuments,
  };
};

/**
 * Hook for document upload operations
 * @returns {Object} Upload state and operations
 */
export const useDocumentUpload = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [processingMode, setProcessingMode] = useState('fast');

  /**
   * Handle file selection
   * @param {File} file - Selected file
   */
  const selectFile = useCallback((file) => {
    setSelectedFile(file);
    setUploadResult(null); // Clear previous results
  }, []);

  /**
   * Upload the selected document
   * @param {Function} onSuccess - Callback for successful upload
   */
  const uploadDocument = useCallback(async (onSuccess) => {
    if (!selectedFile) {
      throw new Error('No file selected');
    }

    setIsUploading(true);
    setUploadResult(null);

    try {
      const result = await documentApi.uploadDocument(selectedFile, processingMode);
      
      setUploadResult({
        success: true,
        message: 'Document uploaded successfully!',
        ...result
      });

      // Clear the selected file after successful upload
      setSelectedFile(null);
      
      // Call success callback if provided
      if (onSuccess) {
        onSuccess(result);
      }

      return result;
    } catch (error) {
      const errorResult = {
        success: false,
        error: error.message
      };
      
      setUploadResult(errorResult);
      throw error;
    } finally {
      setIsUploading(false);
    }
  }, [selectedFile, processingMode]);

  /**
   * Clear upload result
   */
  const clearResult = useCallback(() => {
    setUploadResult(null);
  }, []);

  /**
   * Clear selected file
   */
  const clearFile = useCallback(() => {
    setSelectedFile(null);
    setUploadResult(null);
  }, []);

  return {
    selectedFile,
    isUploading,
    uploadResult,
    processingMode,
    selectFile,
    uploadDocument,
    setProcessingMode,
    clearResult,
    clearFile,
  };
};
