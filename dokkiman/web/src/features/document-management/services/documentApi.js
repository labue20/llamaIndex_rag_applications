/**
 * Document Management API Service
 * Centralized API calls for document-related operations
 */

import { apiClient, apiFetch, readApiError } from '../../../shared/services/apiClient';
import { downloadBlob } from '../../../shared/utils/downloadBlob';

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
      console.log('Uploading file:', file.name, 'Type:', file.type, 'Size:', file.size);
      
      const formData = new FormData();
      formData.append('file', file, file.name); // Explicitly set filename
            formData.append('processing_mode', processingMode);
      
      console.log('FormData entries:');
      for (let [key, value] of formData.entries()) {
        console.log(key, ':', value);
      }

      const response = await apiFetch('/uploadFile', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, `Upload failed (${response.status}).`));
      }

      const result = await response.json();
      console.log('Upload response:', result);
      return result;
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
   * Rename a document (it keeps its file type)
   * @param {string} documentId - The document ID
   * @param {string} name - The new name
   * @returns {Promise<Object>} { doc_id, filename }
   */
  async renameDocument(documentId, name) {
    const response = await apiFetch(`/documents/${encodeURIComponent(documentId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) throw new Error(await readApiError(response, 'The document couldn’t be renamed. Please try again.'));
    return response.json();
  },

  /**
   * Make a copy of a document ("Copy of ..."), in the same folder
   * @param {string} documentId - The document to copy
   * @returns {Promise<Object>} { doc_id, filename, folder_id } of the copy
   */
  async copyDocument(documentId) {
    const response = await apiFetch(`/documents/${encodeURIComponent(documentId)}/copy`, { method: 'POST' });
    if (!response.ok) throw new Error(await readApiError(response, 'The copy couldn’t be made. Please try again.'));
    return response.json();
  },

  /**
   * Download a document's original file
   * @param {string} documentId - The document ID
   * @param {string} fileName - The name to save it as
   */
  async downloadDocument(documentId, fileName) {
    const response = await apiFetch(`/documents/${encodeURIComponent(documentId)}/file`);
    if (!response.ok) throw new Error(await readApiError(response, 'The download didn’t work. Please try again.'));
    downloadBlob(await response.blob(), fileName);
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
