import { useState } from 'react';
import { PulseLoader } from 'react-spinners';
import insertDocument from '../apis/insertDocuments';

const DocumentUploader = ({ setRefreshViewer }) => {
  const [selectedFile, setSelectedFile] = useState();
  const [isFilePicked, setIsFilePicked] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const changeHandler = (event) => {
    if (event.target && event.target.files && event.target.files.length > 0) {
      setSelectedFile(event.target.files[0]);
      setIsFilePicked(true);
    }
  };

  const handleSubmission = () => {
    if (selectedFile) {
      setIsLoading(true);
      insertDocument(selectedFile).then(() => {
        setRefreshViewer(true);
        setSelectedFile(undefined);
        setIsFilePicked(false);
        setIsLoading(false);
      });
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className='uploader'>
      <input
        className='uploader__input'
        type='file'
        name='file-input'
        id='file-input'
        accept='.pdf,.txt,.json,.md,.docx'
        onChange={changeHandler}
        disabled={isLoading}
      />
      <label className='uploader__label' htmlFor='file-input'>
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M12 15V3M12 3L16 7M12 3L8 7M2 17L2 19C2 20.1046 2.89543 21 4 21L20 21C21.1046 21 22 20.1046 22 19L22 17"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div>
          <div>Choose file to upload</div>
          <div style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: '0.25rem' }}>
            Supports PDF, TXT, JSON, MD, DOCX
          </div>
        </div>
      </label>

      {isFilePicked && selectedFile ? (
        <div className='uploader__details'>
          <div className='uploader__details__info'>
            <div>
              <p><strong>File:</strong> {selectedFile.name}</p>
              <p><strong>Size:</strong> {formatFileSize(selectedFile.size)}</p>
              <p><strong>Type:</strong> {selectedFile.type || 'Unknown'}</p>
            </div>
          </div>
          {!isLoading && (
            <button className='uploader__btn' onClick={handleSubmission}>
              Upload Document
            </button>
          )}
        </div>
      ) : (
        <div className='uploader__details'>
          <div className='uploader__details__info'>
            <p>No file selected. Choose a document to add to your knowledge base.</p>
          </div>
        </div>
      )}

      {isLoading && (
        <div className='uploader__loader'>
          <PulseLoader color='#3b82f6' size={8} margin={2} />
          <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
            Processing document...
          </p>
        </div>
      )}
    </div>
  );
};

export default DocumentUploader;
