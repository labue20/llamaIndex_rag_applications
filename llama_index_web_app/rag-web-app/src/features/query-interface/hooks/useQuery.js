/**
 * Query Interface Hooks
 * Custom React hooks for query-related state management and operations
 */

import { useState, useCallback } from 'react';
import { queryApi } from '../services/queryApi';

/**
 * Hook for managing query operations
 * @returns {Object} Query state and operations
 */
export const useQuery = () => {
  const [queryText, setQueryText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [responseText, setResponseText] = useState('');
  const [error, setError] = useState(null);

  /**
   * Execute a query
   * @param {string} query - Query text to execute (optional, uses queryText if not provided)
   */
  const executeQuery = useCallback(async (query) => {
    const textToQuery = query || queryText;
    
    if (!textToQuery.trim()) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await queryApi.executeQuery(textToQuery);
      
      setResponseText(response.text || '');

      // Optionally save to query history
      try {
        await queryApi.saveQuery(textToQuery, response);
      } catch (saveError) {
        console.warn('Failed to save query to history:', saveError);
        // Don't throw here as the main query was successful
      }

    } catch (err) {
      setError(err.message);
      setResponseText('Sorry, there was an error processing your query. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [queryText]);

  /**
   * Clear query results
   */
  const clearResults = useCallback(() => {
    setResponseText('');
    setError(null);
  }, []);

  /**
   * Reset entire query state
   */
  const resetQuery = useCallback(() => {
    setQueryText('');
    setResponseText('');
    setError(null);
    setIsLoading(false);
  }, []);

  return {
    queryText,
    setQueryText,
    isLoading,
    responseText,
    error,
    executeQuery,
    clearResults,
    resetQuery,
  };
};

/**
 * Hook for query suggestions
 * @returns {Object} Suggestion state and operations
 */
export const useQuerySuggestions = () => {
  const [suggestions, setSuggestions] = useState([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);

  /**
   * Get query suggestions for partial text
   * @param {string} partial - Partial query text
   */
  const getSuggestions = useCallback(async (partial) => {
    if (!partial || partial.length < 2) {
      setSuggestions([]);
      return;
    }

    setIsLoadingSuggestions(true);

    try {
      const fetchedSuggestions = await queryApi.getQuerySuggestions(partial);
      setSuggestions(fetchedSuggestions);
    } catch (error) {
      console.error('Error fetching suggestions:', error);
      setSuggestions([]);
    } finally {
      setIsLoadingSuggestions(false);
    }
  }, []);

  /**
   * Clear suggestions
   */
  const clearSuggestions = useCallback(() => {
    setSuggestions([]);
  }, []);

  return {
    suggestions,
    isLoadingSuggestions,
    getSuggestions,
    clearSuggestions,
  };
};

/**
 * Hook for query history management
 * @returns {Object} History state and operations
 */
export const useQueryHistory = () => {
  const [history, setHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  /**
   * Fetch query history
   * @param {number} limit - Number of queries to fetch
   */
  const fetchHistory = useCallback(async (limit = 10) => {
    setIsLoadingHistory(true);

    try {
      const fetchedHistory = await queryApi.getQueryHistory(limit);
      setHistory(fetchedHistory);
    } catch (error) {
      console.error('Error fetching query history:', error);
      setHistory([]);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  /**
   * Clear query history
   */
  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  return {
    history,
    isLoadingHistory,
    fetchHistory,
    clearHistory,
  };
};
