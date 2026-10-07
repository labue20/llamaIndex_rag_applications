/**
 * AI PDF Hooks
 * Custom React hooks for AI PDF features like chat
 */

import { useState, useCallback } from 'react';
import { apiFetch, readApiError } from '../../../shared';
import { generateMessageId, sanitizeInput, handleApiError } from '../utils/helpers';

// Configuration
const API_CONFIG = {
  ENDPOINTS: {
    CHAT: '/chat'
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
      console.log('Making API request to:', API_CONFIG.ENDPOINTS.CHAT);
      
      const response = await apiFetch(API_CONFIG.ENDPOINTS.CHAT, {
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
        throw new Error(await readApiError(response, `Chat request failed (${response.status}).`));
      }

      const data = await response.json();
      console.log('API response data:', data);
      
      const botMessage = {
        id: generateMessageId('assistant'),
        type: 'assistant',
        content: data.response || 'I apologize, but I could not generate a response.',
        documentName: data.document_name,
        note: data.note,
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
