import { DocumentViewer } from '../index';
import { useDocuments } from '../hooks/useDocuments';

const DocumentTools = ({ documents, refreshDocuments }) => {
  const { deleteDocument } = useDocuments();

  const handleDeleteDocument = async (documentId) => {
    try {
      await deleteDocument(documentId);
      // Refresh the document list after deletion
      if (refreshDocuments) {
        refreshDocuments();
      }
    } catch (error) {
      console.error('Error deleting document:', error);
      throw error;
    }
  };

  return (
    <div className="document-tools">
      <DocumentViewer 
        documentList={documents || []} 
        onDeleteDocument={handleDeleteDocument}
      />
    </div>
  );
};

export default DocumentTools;
