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

  let documentListElems = documentList.map((document, index) => {
    const truncatedId = truncateText(document.id, MAX_TITLE_LENGTH);
    const truncatedText = truncateText(document.text, MAX_DOC_LENGTH);
    
    return (
      <div key={document.id} className='viewer__list__item'>
        <p className='viewer__list__title' title={document.id}>
          📄 {truncatedId}
        </p>
        <p className='viewer__list__text' title={document.text}>
          {truncatedText}
        </p>
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
