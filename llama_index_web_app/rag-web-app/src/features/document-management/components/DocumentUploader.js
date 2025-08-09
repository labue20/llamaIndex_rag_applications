import { PulseLoader } from 'react-spinners';
import { useDocumentUpload } from '../hooks/useDocuments';

const DocumentUploader = ({ onUploadSuccess, compact = false }) => {
  const {
    selectedFile,
    isUploading,
    uploadResult,
    processingMode,
    selectFile,
    uploadDocument,
    setProcessingMode,
    clearResult,
  } = useDocumentUpload();

  const isFilePicked = !!selectedFile;

  const changeHandler = async (event) => {
    if (event.target && event.target.files && event.target.files.length > 0) {
      const file = event.target.files[0];
      selectFile(file);
      
      // If in compact mode, auto-upload the file
      if (compact) {
        try {
          await uploadDocument(onUploadSuccess, file);
          // Reset the input to allow selecting the same file again
          event.target.value = '';
        } catch (error) {
          console.error('Auto-upload failed:', error);
          // Reset the input on error as well
          event.target.value = '';
        }
      }
    }
  };

  const handleSubmission = async () => {
    try {
      await uploadDocument(onUploadSuccess);
    } catch (error) {
      console.error('Upload failed:', error);
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
    <div className={`uploader ${compact ? 'uploader--compact' : ''}`}>
      <input
        className='uploader__input'
        type='file'
        name='file-input'
        id='file-input'
        accept='.pdf,.txt,.json,.md,.docx'
        onChange={changeHandler}
        disabled={isUploading}
      />
      
      {compact ? (
        // Compact button for header
        <label className={`uploader__compact-btn ${isUploading ? 'uploader__compact-btn--uploading' : ''}`} htmlFor='file-input'>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M12 15V3M12 3L16 7M12 3L8 7M2 17L2 19C2 20.1046 2.89543 21 4 21L20 21C21.1046 21 22 20.1046 22 19L22 17"
              stroke="#3b82f6"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>{isUploading ? 'Uploading...' : 'Select Files'}</span>
        </label>
      ) : (
        // Full upload area
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
              stroke="#3b82f6"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div>
            <div style={{ color: '#3b82f6' }}>Select Files</div>
            <div style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: '0.25rem' }}>
              Supports PDF, TXT, JSON, MD, DOCX
            </div>
          </div>
        </label>
      )}

      {!compact && isFilePicked && selectedFile ? (
        <div className='uploader__details'>
          <div className='uploader__details__info'>
            <div>
              <p><strong>File:</strong> {selectedFile.name}</p>
              <p><strong>Size:</strong> {formatFileSize(selectedFile.size)}</p>
              <p><strong>Type:</strong> {selectedFile.type || 'Unknown'}</p>
            </div>
          </div>
          
          {/* Processing Mode Selector */}
          <div className='uploader__processing-mode'>
            <label className='uploader__mode-label'>
              <strong>Processing Mode:</strong>
            </label>
            <div className='uploader__mode-options'>
              <label className='uploader__radio-option'>
                <input
                  type='radio'
                  value='fast'
                  checked={processingMode === 'fast'}
                  onChange={(e) => setProcessingMode(e.target.value)}
                  disabled={isUploading}
                />
                <span className='uploader__radio-label'>
                  ⚡ Fast <small>(Sentence chunking, ~5-10s)</small>
                </span>
              </label>
              <label className='uploader__radio-option'>
                <input
                  type='radio'
                  value='enhanced'
                  checked={processingMode === 'enhanced'}
                  onChange={(e) => setProcessingMode(e.target.value)}
                  disabled={isUploading}
                />
                <span className='uploader__radio-label'>
                  🧠 Enhanced <small>(Semantic + AI metadata, ~30-60s)</small>
                </span>
              </label>
            </div>
          </div>
          
          {!isUploading && (
            <button className='uploader__btn' onClick={handleSubmission}>
              Upload Document ({processingMode === 'fast' ? 'Fast' : 'Enhanced'})
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

      {/* Upload Result Display */}
      {uploadResult && (
        <div className={`uploader__result ${uploadResult.success ? 'uploader__result--success' : 'uploader__result--error'}`}>
          {uploadResult.success ? (
            <div>
              <div className='uploader__result-title'>✅ {uploadResult.message}</div>
              <div className='uploader__result-details'>
                <small>
                  • Processing time: {uploadResult.processingTime?.toFixed(2)}s
                </small>
              </div>
            </div>
          ) : (
            <div>
              <div className='uploader__result-title'>❌ Upload Failed</div>
              <div className='uploader__result-details'>
                <small>{uploadResult.error}</small>
              </div>
            </div>
          )}
        </div>
      )}

      {isUploading && (
        <div className='uploader__loader'>
          <PulseLoader color='#3b82f6' size={8} margin={2} />
          <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
            Processing document in {processingMode} mode...
          </p>
        </div>
      )}
    </div>
  );
};

export default DocumentUploader;
