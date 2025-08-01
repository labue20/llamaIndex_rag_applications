import { useState } from 'react';
import { CircleLoader } from 'react-spinners';
import classNames from 'classnames';
import queryIndex from '../apis/queryIndex';

const IndexQuery = () => {
  const [isLoading, setLoading] = useState(false);
  const [responseText, setResponseText] = useState('');
  const [responseSources, setResponseSources] = useState([]);
  const [queryText, setQueryText] = useState('');

  const handleQuery = (e) => {
    if (e.key === 'Enter' && queryText.trim()) {
      executeQuery();
    }
  };

  const handleButtonClick = () => {
    if (queryText.trim()) {
      executeQuery();
    }
  };

  const executeQuery = () => {
    setLoading(true);
    queryIndex(queryText).then((response) => {
      setLoading(false);
      setResponseText(response.text);
      setResponseSources(response.sources);
    }).catch((error) => {
      setLoading(false);
      setResponseText('Sorry, there was an error processing your query. Please try again.');
      setResponseSources([]);
      console.error('Query error:', error);
    });
  };

  const handleInputChange = (e) => {
    setQueryText(e.target.value);
  };

  const sourceElems = responseSources.map((source, index) => {
    const nodeTitle =
      source.doc_id && source.doc_id.length > 35
        ? source.doc_id.substring(0, 35) + '...'
        : source.doc_id;
    const nodeText =
      source.text && source.text.length > 180
        ? source.text.substring(0, 180) + '...'
        : source.text;

    const similarity = source.similarity ? (source.similarity * 100).toFixed(1) : 'N/A';

    return (
      <div key={`${source.doc_id}-${index}`} className='query__sources__item'>
        <p className='query__sources__item__id' title={source.doc_id}>
          📄 {nodeTitle}
        </p>
        <p className='query__sources__item__text' title={source.text}>
          {nodeText}
        </p>
        <p className='query__sources__item__footer'>
          Relevance: {similarity}% | Position: {source.start}-{source.end}
        </p>
      </div>
    );
  });

  return (
    <div className='query'>
      <div className='query__input'>
        <label htmlFor='query-text'>💬 Ask a question about your documents</label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type='text'
            name='query-text'
            placeholder='What would you like to know?'
            onKeyDown={handleQuery}
            onChange={handleInputChange}
            value={queryText}
            disabled={isLoading}
            style={{ flex: 1 }}
          />
          <button 
            onClick={handleButtonClick}
            disabled={isLoading || !queryText.trim()}
            style={{
              padding: '0.75rem 1rem',
              border: 'none',
              borderRadius: '6px',
              backgroundColor: '#3b82f6',
              color: 'white',
              cursor: queryText.trim() && !isLoading ? 'pointer' : 'not-allowed',
              opacity: queryText.trim() && !isLoading ? 1 : 0.5,
              fontWeight: '500',
              fontSize: '0.875rem'
            }}
          >
            {isLoading ? '...' : 'Ask'}
          </button>
        </div>
      </div>

      <CircleLoader
        className={classNames('query__loader', {
          'query__loader--loading': isLoading,
        })}
        color='#3b82f6'
        size={30}
      />

      <div
        className={classNames('query__results', {
          'query__results--loading': isLoading,
        })}
      >
        <div className='query__sources__item'>
          <p className='query__sources__item__id'>🤖 AI Response</p>
        </div>
        <div style={{ padding: '1rem' }}>
          {responseText || (
            <p style={{ 
              color: '#6b7280', 
              fontStyle: 'italic',
              textAlign: 'center',
              margin: '2rem 0'
            }}>
              Ask a question to get started. I'll search through your documents to provide relevant answers.
            </p>
          )}
        </div>
      </div>

      <div
        className={classNames('query__sources', {
          'query__sources--loading': isLoading,
        })}
      >
        <div className='query__sources__item'>
          <p className='query__sources__item__id'>
            📋 Source References ({responseSources.length})
          </p>
        </div>
        {responseSources.length > 0 ? (
          sourceElems
        ) : (
          <div style={{ 
            padding: '2rem 1rem', 
            textAlign: 'center',
            color: '#6b7280',
            fontStyle: 'italic'
          }}>
            Source references will appear here after you ask a question.
          </div>
        )}
      </div>
    </div>
  );
};

export default IndexQuery;
