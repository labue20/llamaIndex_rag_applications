/**
 * AI PDF Hooks
 * Custom React hooks for AI PDF features like chat and summarization
 */

import { useState, useCallback } from 'react';
import { generateMessageId, sanitizeInput, handleApiError } from '../utils/helpers';

// Configuration
const API_CONFIG = {
  BASE_URL: process.env.REACT_APP_API_URL || 'http://localhost:5601',
  ENDPOINTS: {
    CHAT: '/chat',
    SUMMARIZE: '/summarize'
  }
};

/**
 * Hook for PDF chat functionality
 * @returns {Object} Chat state and operations
 */
export const usePdfChat = () => {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedPdf, setSelectedPdf] = useState(null);

  /**
   * Send a message to chat with PDF
   * @param {string} message - User message
   * @param {string} pdfId - Selected PDF document ID
   */
  const sendMessage = useCallback(async (message, pdfId) => {
    if (!pdfId) {
      throw new Error('No PDF selected for chat');
    }

    const sanitizedMessage = sanitizeInput(message);
    if (!sanitizedMessage) {
      throw new Error('Message cannot be empty');
    }

    console.log('Sending chat request:', { message: sanitizedMessage, documentId: pdfId });
    
    setIsLoading(true);
    setError(null);

    // Add user message
    const userMessage = {
      id: generateMessageId('user'),
      type: 'user',
      content: sanitizedMessage,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, userMessage]);

    try {
      const apiUrl = `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.CHAT}`;
      console.log('Making API request to:', apiUrl);
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: sanitizedMessage,
          documentId: pdfId
        })
      });

      console.log('API response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('API error response:', errorText);
        throw new Error(`Chat request failed: ${response.status} ${response.statusText}. ${errorText}`);
      }

      const data = await response.json();
      console.log('API response data:', data);
      
      const botMessage = {
        id: generateMessageId('assistant'),
        type: 'assistant',
        content: data.response || 'I apologize, but I could not generate a response.',
        documentName: data.document_name,
        timestamp: new Date().toISOString()
      };
      
      setMessages(prev => [...prev, botMessage]);
    } catch (err) {
      console.error('Chat error:', err);
      const errorMessage = handleApiError(err, 'PDF chat');
      setError(errorMessage);
      
      // Remove user message on error
      setMessages(prev => prev.filter(msg => msg.id !== userMessage.id));
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Clear chat messages
   */
  const clearChat = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    clearChat,
  };
};

/**
 * Hook for PDF summarization functionality
 * @returns {Object} Summary state and operations
 */
export const usePdfSummary = () => {
  const [summary, setSummary] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Generate PDF summary
   * @param {string} pdfId - PDF document ID
   * @param {string} summaryType - Type of summary (overview, detailed, bullet-points)
   */
  const generateSummary = useCallback(async (pdfId, summaryType = 'overview') => {
    if (!pdfId) {
      throw new Error('No PDF selected for summarization');
    }

    setIsGenerating(true);
    setError(null);
    setSummary(null);

    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.SUMMARIZE}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documentId: pdfId,
          summaryType
        })
      });

      if (!response.ok) {
        throw new Error(`Summarization request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      setSummary({
        type: summaryType,
        content: data.summary || 'Unable to generate summary.',
        keyPoints: data.keyPoints || [],
        wordCount: data.wordCount || 0,
        generatedAt: new Date().toISOString()
      });
    } catch (err) {
      const errorMessage = handleApiError(err, 'PDF summarization');
      setError(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  }, []);

  /**
   * Clear summary
   */
  const clearSummary = useCallback(() => {
    setSummary(null);
    setError(null);
  }, []);

  return {
    summary,
    isGenerating,
    error,
    generateSummary,
    clearSummary,
  };
};
