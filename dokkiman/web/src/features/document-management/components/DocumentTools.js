/**
 * Document Tools
 * The Document Manager: folders (one level of subfolders), the signature
 * requests filed in each, and the documents. The open folder is in the
 * address (/app/documents?folder=<id>), so Back works and uploads know
 * where to go.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DocumentViewer } from '../index';
import { useDocuments } from '../hooks/useDocuments';
import { folderApi, folderPath } from '../services/folderApi';
import { fetchSignatureRequests } from '../../e-sign/requestsApi';
import FolderBrowser from './FolderBrowser';
import CompactUploadButton from './CompactUploadButton';
import '../styles/folders.scss';

const DocumentTools = ({ documents, refreshDocuments, onUploadSuccess }) => {
  const { deleteDocument } = useDocuments();
  const [searchParams, setSearchParams] = useSearchParams();
  const folderId = searchParams.get('folder') || null;
  const [folders, setFolders] = useState([]);
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  const loadFolders = useCallback(async () => {
    try {
      const [folderList, requestList] = await Promise.all([folderApi.list(), fetchSignatureRequests()]);
      setFolders(folderList);
      setRequests(requestList);
      setError('');
      setLoaded(true);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  // Reload with the document list too, so folder counts follow uploads and deletions
  useEffect(() => {
    loadFolders();
  }, [loadFolders, documents]);

  const byId = useMemo(() => Object.fromEntries(folders.map((f) => [f.id, f])), [folders]);
  const currentFolder = folderId ? byId[folderId] : null;

  // A folder that no longer exists (deleted, or an old link): back to the top
  useEffect(() => {
    if (loaded && folderId && !byId[folderId]) setSearchParams({}, { replace: true });
  }, [loaded, folderId, byId, setSearchParams]);

  const trail = [];
  for (let folder = currentFolder; folder; folder = byId[folder.parent_id]) trail.unshift(folder);

  const here = (item) => (item.folder_id || null) === folderId;
  const subfolders = folders.filter((f) => (f.parent_id || null) === folderId);
  const documentsHere = (documents || []).filter(here);
  const requestsHere = requests.filter(here);

  const open = (id) => setSearchParams(id ? { folder: id } : {});

  const refreshAll = () => {
    loadFolders();
    refreshDocuments?.();
  };

  const createFolder = async (name) => {
    await folderApi.create(name, folderId);
    await loadFolders();
  };

  const renameFolder = async (folder) => {
    const name = window.prompt('Rename folder', folder.name);
    if (name === null || !name.trim() || name.trim() === folder.name) return;
    try {
      await folderApi.rename(folder.id, name);
      await loadFolders();
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteFolder = async (folder) => {
    const where = folder.parent_id ? 'the folder above' : 'All documents';
    if (!window.confirm(`Delete the folder “${folder.name}”? Nothing in it is deleted: its contents move to ${where}.`)) {
      return;
    }
    try {
      await folderApi.remove(folder.id);
      refreshAll();
    } catch (err) {
      setError(err.message);
    }
  };

  // Where selected documents can be moved: "No folder" and every folder, by path
  const moveTargets = [
    { id: null, label: 'All documents (no folder)' },
    ...folders
      .map((f) => ({ id: f.id, label: folderPath(folders, f.id) }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  ].filter((target) => target.id !== folderId);

  const moveDocuments = async (documentIds, targetId) => {
    await folderApi.move(targetId, { documentIds });
    refreshAll();
  };

  const handleDeleteDocument = async (documentId) => {
    try {
      await deleteDocument(documentId);
      refreshAll();
    } catch (err) {
      console.error('Error deleting document:', err);
      throw err;
    }
  };

  return (
    <div className='document-tools'>
      <FolderBrowser
        folders={folders}
        currentFolder={currentFolder}
        trail={trail}
        subfolders={subfolders}
        requests={requestsHere}
        onOpen={open}
        onCreate={createFolder}
        onRename={renameFolder}
        onDelete={deleteFolder}
        error={error}
        // Says where the file goes: into the open folder
        uploadButton={(
          <CompactUploadButton
            label={currentFolder ? `Upload to ${currentFolder.name}` : 'Upload files'}
            onUploadSuccess={(result) => {
              onUploadSuccess?.(result);
              loadFolders();
            }}
          />
        )}
      />
      {/* Nothing to list here (the folders and requests above say it all): no empty table */}
      {!(documentsHere.length === 0 && !currentFolder && (subfolders.length > 0 || requestsHere.length > 0)) && (
      <div className='document-tools__content'>
        <DocumentViewer
          documentList={documentsHere}
          onDeleteDocument={handleDeleteDocument}
          moveTargets={moveTargets}
          onMoveDocuments={moveDocuments}
          emptyText={currentFolder
            ? 'No documents in this folder yet. Upload one with “Upload files”, or move documents here.'
            : null}
        />
      </div>
      )}
    </div>
  );
};

export default DocumentTools;
