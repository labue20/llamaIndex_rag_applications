import { DocumentUploader, DocumentViewer } from '../index';
import { useDocuments } from '../hooks/useDocuments';

const DocumentTools = () => {
  const { documents, refreshDocuments } = useDocuments();

  const handleUploadSuccess = () => {
    refreshDocuments();
  };

  return (
    <div className="document-tools">
      <DocumentUploader onUploadSuccess={handleUploadSuccess} />
      <DocumentViewer documentList={documents} />
    </div>
  );
};

export default DocumentTools;
