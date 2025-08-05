/**
 * Document Management API Service
 * Centralized API calls for document-related operations
 */

import { apiClient } from '../../../shared/services/apiClient';

export const documentApi = {
  /**
   * Fetch all documents from the server
   * @returns {Promise<Array>} List of documents
   */
  async fetchDocuments() {
    try {
      const response = await apiClient.get('/getDocuments');
      return response;
    } catch (error) {
      console.error('Error fetching documents:', error);
      throw error;
    }
  },

  /**
   * Upload a document to the server
   * @param {File} file - The file to upload
   * @param {string} processingMode - Processing mode ('fast' or 'enhanced')
   * @returns {Promise<Object>} Upload result
   */
  async uploadDocument(file, processingMode = 'fast') {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('processing_mode', processingMode);

      const uploadURL = 'http://localhost:5601/uploadFile';
      const response = await fetch(uploadURL, {
        method: 'POST',
        body: formData,
        mode: 'cors'
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload failed: ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error uploading document:', error);
      throw error;
    }
  },

  /**
   * Fetch full document content
   * @param {string} documentId - The document ID
   * @returns {Promise<Object>} Full document data
   */
  async fetchFullDocument(documentId) {
    try {
      const response = await apiClient.get(`/documents/${documentId}/full`);
      return response;
    } catch (error) {
      console.error('Error fetching full document:', error);
      throw error;
    }
  },

  /**
   * Delete a document
   * @param {string} documentId - The document ID to delete
   * @returns {Promise<Object>} Deletion result
   */
  async deleteDocument(documentId) {
    try {
      const response = await apiClient.delete(`/documents/${documentId}`);
      return response;
    } catch (error) {
      console.error('Error deleting document:', error);
      throw error;
    }
  },

  /**
   * Generate summary for a document
   * @param {string} documentId - The document ID
   * @returns {Promise<Object>} Summary data
   */
  async generateSummary(documentId) {
    try {
      const response = await apiClient.post(`/documents/${documentId}/summary`);
      return response;
    } catch (error) {
      console.error('Error generating summary:', error);
      throw error;
    }
  },

  /**
   * Generate MCQ for a document
   * @param {string} documentId - The document ID
   * @param {number} questionCount - Number of questions to generate
   * @returns {Promise<Object>} MCQ data
   */
  async generateMCQ(documentId, questionCount = 5) {
    try {
      const response = await apiClient.post(`/documents/${documentId}/mcq`, {
        question_count: questionCount
      });
      return response;
    } catch (error) {
      console.error('Error generating MCQ:', error);
      throw error;
    }
  }
};
