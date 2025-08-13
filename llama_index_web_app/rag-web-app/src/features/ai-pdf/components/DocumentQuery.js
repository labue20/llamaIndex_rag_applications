/**
 * Document Query Component
 * Query interface for searching through all documents in the index
 */

import React, { useState, useCallback } from 'react';
import { PulseLoader } from 'react-spinners';
import classNames from 'classnames';
import { sanitizeInput, handleApiError } from '../utils/helpers';

// Configuration
const API_CONFIG = {
  BASE_URL: process.env.REACT_APP_API_URL || 'http://localhost:5601',
  ENDPOINTS: {
    QUERY: '/queryFile'
  }
};

const DocumentQuery = () => {
  const [queryText, setQueryText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [responseText, setResponseText] = useState('');
  const [error, setError] = useState(null);

  /**
   * Execute a query
   */
  const executeQuery = useCallback(async () => {
    const sanitizedQuery = sanitizeInput(queryText);
    if (!sanitizedQuery) {
      setError('Please enter a search query');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResponseText('');

    try {
      const queryURL = new URL(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.QUERY}`);
      queryURL.searchParams.append('text', sanitizedQuery);

      const response = await fetch(queryURL, { 
        mode: 'cors',
        method: 'GET'
      });
      
      if (!response.ok) {
        throw new Error(`Query failed: ${response.status} ${response.statusText}`);
      }

      const queryResponse = await response.json();
      
      setResponseText(queryResponse.text || 'No response generated.');

    } catch (err) {
      const errorMessage = handleApiError(err, 'document query');
      setError(errorMessage);
      setResponseText('');
    } finally {
      setIsLoading(false);
    }
  }, [queryText]);

  const handleQuery = (e) => {
    if (e.key === 'Enter' && queryText.trim() && !isLoading) {
      executeQuery();
    }
  };

  const handleButtonClick = () => {
    if (queryText.trim() && !isLoading) {
      executeQuery();
    }
  };

  const handleInputChange = (e) => {
    setQueryText(e.target.value);
    // Clear error when user starts typing
    if (error) {
      setError(null);
    }
  };

  return (
    <div className='query'>
      <div className='query__input'>
        <label htmlFor='query-text'>🔍 Search across all your documents</label>
        <div className='query__input-group'>
          <input
            type='text'
            name='query-text'
            placeholder='What would you like to know?'
            onKeyDown={handleQuery}
            onChange={handleInputChange}
            value={queryText}
            disabled={isLoading}
            className='query__input-field'
          />
          <button 
            onClick={handleButtonClick}
            disabled={isLoading || !queryText.trim()}
            className='query__input-button'
          >
            {isLoading ? '...' : 'Search'}
          </button>
        </div>
      </div>

      <div
        className={classNames('query__loader', {
          'query__loader--loading': isLoading,
        })}
      >
        <PulseLoader
          color='#3b82f6'
          size={8}
          margin={2}
        />
      </div>

      <div className='query__results'>
        <div className='query__response-header'>
          <p className='query__response-title'>🤖 AI Response</p>
        </div>
        <div className='query__response-content'>
          {responseText ? (
            <div className='query__response-text'>
              {responseText.split('\n\n').map((paragraph, index) => (
                <p key={index} className='query__response-paragraph'>
                  {paragraph.split('\n').map((line, lineIndex) => (
                    <span key={lineIndex}>
                      {line}
                      {lineIndex < paragraph.split('\n').length - 1 && <br />}
                    </span>
                  ))}
                </p>
              ))}
            </div>
          ) : (
            <p className='query__response-placeholder'>
              Search through all your documents to find relevant information. I'll analyze the content and provide comprehensive answers.
            </p>
          )}
        </div>
      </div>

      {error && (
        <div className='query__error'>
          ❌ {error}
        </div>
      )}
    </div>
  );
};

export default DocumentQuery;
