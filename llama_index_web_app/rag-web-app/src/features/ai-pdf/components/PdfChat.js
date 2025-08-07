/**
 * PDF Chat Component
 * Interactive chat interface for conversing with PDF documents
 */

import React, { useState, useRef, useEffect } from 'react';
import { usePdfChat } from '../hooks/usePdfFeatures';

const PdfChat = () => {
  const [inputMessage, setInputMessage] = useState('');
  const { messages, isLoading, error, selectedPdf, sendMessage } = usePdfChat();
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || isLoading) return;

    try {
      await sendMessage(inputMessage.trim());
      setInputMessage('');
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <div className='pdf-chat'>
      <div className='pdf-chat__header'>
        <h3>💬 Chat with PDF</h3>
        {selectedPdf ? (
          <p className='pdf-chat__selected'>
            Chatting with: <strong>{selectedPdf.name}</strong>
          </p>
        ) : (
          <p className='pdf-chat__no-selection'>
            Please select a PDF document above to start chatting
          </p>
        )}
      </div>

      <div className='pdf-chat__messages'>
        {messages.length === 0 ? (
          <div className='pdf-chat__empty'>
            <p>Start a conversation by asking questions about your PDF!</p>
            <div className='pdf-chat__suggestions'>
              <h4>Try asking:</h4>
              <ul>
                <li>"What is this document about?"</li>
                <li>"Summarize the main points"</li>
                <li>"What are the key findings?"</li>
                <li>"Explain the methodology used"</li>
              </ul>
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <div 
              key={message.id} 
              className={`pdf-chat__message pdf-chat__message--${message.type}`}
            >
              <div className='pdf-chat__message-content'>
                {message.content}
              </div>
              <div className='pdf-chat__message-time'>
                {formatTime(message.timestamp)}
              </div>
            </div>
          ))
        )}
        
        {isLoading && (
          <div className='pdf-chat__message pdf-chat__message--assistant pdf-chat__message--loading'>
            <div className='pdf-chat__message-content'>
              <div className='pdf-chat__typing'>
                <span></span>
                <span></span>
                <span></span>
              </div>
              Analyzing PDF...
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {error && (
        <div className='pdf-chat__error'>
          <p>❌ {error}</p>
        </div>
      )}

      <form className='pdf-chat__input' onSubmit={handleSubmit}>
        <input
          type='text'
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          placeholder={selectedPdf ? 'Ask a question about your PDF...' : 'Select a PDF first...'}
          disabled={!selectedPdf || isLoading}
          className='pdf-chat__input-field'
        />
        <button
          type='submit'
          disabled={!selectedPdf || !inputMessage.trim() || isLoading}
          className='pdf-chat__send-btn'
        >
          {isLoading ? '⏳' : '📤'}
        </button>
      </form>
    </div>
  );
};

export default PdfChat;
