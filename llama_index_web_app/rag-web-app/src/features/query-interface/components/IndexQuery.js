import { PulseLoader } from 'react-spinners';
import classNames from 'classnames';
import { useQuery } from '../hooks/useQuery';

const IndexQuery = () => {
  const {
    queryText,
    setQueryText,
    isLoading,
    responseText,
    executeQuery,
  } = useQuery();

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

  const handleInputChange = (e) => {
    setQueryText(e.target.value);
  };

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

      <div
        className={classNames('query__results', {
          'query__results--loading': isLoading,
        })}
      >
        <div className='query__response-header'>
          <p className='query__response-title'>🤖 AI Response</p>
        </div>
        <div style={{ padding: '1rem' }}>
          {responseText ? (
            <div style={{ lineHeight: '1.6' }}>
              {responseText.split('\n\n').map((paragraph, index) => (
                <p key={index} style={{ marginBottom: '1rem', margin: '0 0 1rem 0' }}>
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
    </div>
  );
};

export default IndexQuery;
