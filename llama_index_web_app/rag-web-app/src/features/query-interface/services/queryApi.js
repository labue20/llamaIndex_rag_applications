/**
 * Query Interface API Service
 * Centralized API calls for query-related operations
 */

import { apiClient } from '../../../shared/services/apiClient';

export const queryApi = {
  /**
   * Execute a query against the document index
   * @param {string} queryText - The query text
   * @returns {Promise<Object>} Query response with text and sources
   */
  async executeQuery(queryText) {
    try {
      const queryURL = new URL('http://localhost:5601/queryFile?');
      queryURL.searchParams.append('text', queryText);

      const response = await fetch(queryURL, { mode: 'cors' });
      
      if (!response.ok) {
        throw new Error(`Query failed: ${response.statusText}`);
      }

      const queryResponse = await response.json();
      return queryResponse;
    } catch (error) {
      console.error('Query error:', error);
      return { 
        text: 'Sorry, there was an error processing your query. Please try again.', 
        sources: [] 
      };
    }
  },

  /**
   * Get query suggestions based on document content
   * @param {string} partial - Partial query text
   * @returns {Promise<Array>} Array of query suggestions
   */
  async getQuerySuggestions(partial) {
    try {
      const response = await apiClient.get(`/query/suggestions?q=${encodeURIComponent(partial)}`);
      return response.suggestions || [];
    } catch (error) {
      console.error('Error fetching query suggestions:', error);
      return [];
    }
  },

  /**
   * Save a query to query history
   * @param {string} queryText - The query text
   * @param {Object} response - The query response
   * @returns {Promise<Object>} Save result
   */
  async saveQuery(queryText, response) {
    try {
      const result = await apiClient.post('/query/history', {
        query: queryText,
        response: response,
        timestamp: new Date().toISOString()
      });
      return result;
    } catch (error) {
      console.error('Error saving query:', error);
      throw error;
    }
  },

  /**
   * Get query history
   * @param {number} limit - Number of queries to retrieve
   * @returns {Promise<Array>} Array of past queries
   */
  async getQueryHistory(limit = 10) {
    try {
      const response = await apiClient.get(`/query/history?limit=${limit}`);
      return response.history || [];
    } catch (error) {
      console.error('Error fetching query history:', error);
      return [];
    }
  }
};
