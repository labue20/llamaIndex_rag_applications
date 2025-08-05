const MAX_TITLE_LENGTH = 45;
const MAX_DOC_LENGTH = 200;

const DocumentViewer = ({ documentList }) => {
  const prepend = (array, value) => {
    const newArray = array.slice();
    newArray.unshift(value);
    return newArray;
  };

  const truncateText = (text, maxLength) => {
    return text.length <= maxLength ? text : text.substring(0, maxLength) + '...';
  };

  const formatNumber = (num) => {
    return num ? num.toLocaleString() : 'N/A';
  };

  const getFileTypeIcon = (fileType) => {
    switch (fileType?.toLowerCase()) {
      case '.pdf': return '📄';
      case '.txt': return '📝';
      case '.md': return '📋';
      case '.docx': return '📄';
      case '.json': return '📊';
      default: return '📄';
    }
  };

  const getChunkingStrategyBadge = (strategy) => {
    switch (strategy) {
      case 'enhanced_semantic': return '🧠 Semantic';
      case 'sentence': return '📝 Sentence';
      case 'token': return '🔤 Token';
      default: return '📦 Basic';
    }
  };

  let documentListElems = documentList.map((document, index) => {
    const truncatedId = truncateText(document.id, MAX_TITLE_LENGTH);
    const truncatedText = truncateText(document.text, MAX_DOC_LENGTH);
    const fileIcon = getFileTypeIcon(document.file_type);
    const chunkingBadge = getChunkingStrategyBadge(document.chunking_strategy);
    
    // Enhanced document information
    const hasStatistics = document.statistics && Object.keys(document.statistics).length > 0;
    const hasKeyMetadata = document.total_nodes > 0 || document.file_type || document.chunking_strategy;
    
    return (
      <div key={document.id} className='viewer__list__item viewer__enhanced-item'>
        <div className='viewer__enhanced-header'>
          <p className='viewer__list__title' title={document.id}>
            {fileIcon} {truncatedId}
          </p>
          {hasKeyMetadata && (
            <div className='viewer__metadata-badges'>
              <span className='viewer__badge viewer__badge--chunks'>
                {document.total_nodes || 0} chunks
              </span>
              <span className='viewer__badge viewer__badge--strategy'>
                {chunkingBadge}
              </span>
            </div>
          )}
        </div>
        
        {hasStatistics && (
          <div className='viewer__statistics'>
            <div className='viewer__stat-row'>
              <span className='viewer__stat-item'>
                � {formatNumber(document.statistics.total_words)} words
              </span>
              <span className='viewer__stat-item'>
                📝 {formatNumber(document.statistics.total_characters)} chars
              </span>
            </div>
            {document.statistics.total_paragraphs && (
              <div className='viewer__stat-row'>
                <span className='viewer__stat-item'>
                  ¶ {formatNumber(document.statistics.total_paragraphs)} paragraphs
                </span>
              </div>
            )}
          </div>
        )}
        
        <p className='viewer__list__text' title={document.text}>
          {truncatedText}
        </p>
        
        {document.key_sections && document.key_sections.length > 0 && (
          <div className='viewer__key-sections'>
            <p className='viewer__sections-title'>🔑 Key Sections:</p>
            {document.key_sections.slice(0, 2).map((section, idx) => (
              <p key={idx} className='viewer__section-item'>
                • {truncateText(section, 60)}
              </p>
            ))}
            {document.key_sections.length > 2 && (
              <p className='viewer__section-item viewer__section-more'>
                +{document.key_sections.length - 2} more sections...
              </p>
            )}
          </div>
        )}
        
        {document.processing_timestamp && (
          <div className='viewer__timestamp'>
            <small>
              ⏰ Processed: {new Date(document.processing_timestamp).toLocaleString()}
            </small>
          </div>
        )}
      </div>
    );
  });

  // prepend header
  documentListElems = prepend(
    documentListElems,
    <div key='viewer_title' className='viewer__list__item'>
      <p className='viewer__list__header'>
        📚 Document Library ({documentList.length} documents)
      </p>
    </div>
  );

  return (
    <div className='viewer'>
      <div className='viewer__list'>
        {documentList.length > 0 ? (
          documentListElems
        ) : (
          <>
            <div className='viewer__list__item'>
              <p className='viewer__list__header'>📚 Document Library (0 documents)</p>
            </div>
            <div className='viewer__list__item'>
              <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📁</div>
                <p className='viewer__list__title' style={{ marginBottom: '0.5rem' }}>
                  No documents yet
                </p>
                <p className='viewer__list__text'>
                  Upload your first document to start building your knowledge base. 
                  Supported formats: PDF, TXT, JSON, MD, DOCX
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default DocumentViewer;
