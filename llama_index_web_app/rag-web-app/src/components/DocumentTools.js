import { useEffect, useState } from 'react';
import DocumentUploader from './DocumentUploader';
import DocumentViewer from './DocumentViewer';
import fetchDocuments from '../apis/fetchDocuments';

const DocumentTools = () => {
  const [refreshViewer, setRefreshViewer] = useState(false);
  const [documentList, setDocumentList] = useState([]);

  // Get the list on first load
  useEffect(() => {
    fetchDocuments().then((documents) => {
      console.log('DocumentTools: Fetched documents:', documents?.length || 0);
      setDocumentList(documents || []);
    }).catch((error) => {
      console.error('DocumentTools: Error fetching documents:', error);
      setDocumentList([]);
    });
  }, []);

  useEffect(() => {
    if (refreshViewer) {
      console.log('DocumentTools: Refreshing viewer');
      setRefreshViewer(false);
      fetchDocuments().then((documents) => {
        console.log('DocumentTools: Refreshed documents:', documents?.length || 0);
        setDocumentList(documents || []);
      }).catch((error) => {
        console.error('DocumentTools: Error refreshing documents:', error);
      });
    }
  }, [refreshViewer]);

  return (
    <div className="document-tools">
      <DocumentUploader setRefreshViewer={setRefreshViewer} />
      <DocumentViewer documentList={documentList} />
    </div>
  );
};

export default DocumentTools;
