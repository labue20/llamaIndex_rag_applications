/**
 * Document Tools
 * The Document Manager: folders (one level of subfolders), the signature
 * requests filed in each, and the documents. The open folder is in the
 * address (/app/documents?folder=<id>), so Back works and uploads know
 * where to go. A search box finds folders, documents and requests across
 * every folder; folders sort A–Z or by recent activity.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DocumentViewer } from '../index';
import { useDocuments } from '../hooks/useDocuments';
import { folderApi, folderPath } from '../services/folderApi';
import { fetchSignatureRequests } from '../../e-sign/requestsApi';
import FolderBrowser from './FolderBrowser';
import CompactUploadButton from './CompactUploadButton';
import DocumentSearch from './DocumentSearch';
import { Icon } from '../../../shared';
import '../styles/folders.scss';

const SORT_KEY = 'dokkiman.folderSort';
const readSort = () => {
  try {
    return window.localStorage.getItem(SORT_KEY) === 'recent' ? 'recent' : 'name';
  } catch {
    return 'name';
  }
};

// A document's display name (older uploads keep it in different fields)
const nameOf = (document) => document.filename || document.file_name || document.name || 'Document';
const time = (value) => (value ? new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`).getTime() || 0 : 0);

const DocumentTools = ({ documents, refreshDocuments, onUploadSuccess }) => {
  const { deleteDocument } = useDocuments();
  const [searchParams, setSearchParams] = useSearchParams();
  const folderId = searchParams.get('folder') || null;
  const [folders, setFolders] = useState([]);
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState(readSort);

  const changeSort = (value) => {
    setSort(value);
    try {
      window.localStorage.setItem(SORT_KEY, value);
    } catch {
      // Not remembered (private browsing): fine
    }
  };

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

  // Latest activity in each folder (its own creation, uploads and signature
  // activity, including its subfolders'), for "Recently used"
  const lastActivity = useMemo(() => {
    const latest = Object.fromEntries(folders.map((f) => [f.id, time(f.created_at)]));
    const bump = (folder, when) => {
      for (let f = byId[folder]; f; f = byId[f.parent_id]) latest[f.id] = Math.max(latest[f.id] || 0, when);
    };
    (documents || []).forEach((d) => d.folder_id && bump(d.folder_id, time(d.processing_timestamp)));
    requests.forEach((r) => r.folder_id && bump(r.folder_id, Math.max(time(r.created_at), time(r.completed_at))));
    return latest;
  }, [folders, byId, documents, requests]);

  const subfolders = folders
    .filter((f) => (f.parent_id || null) === folderId)
    .sort(sort === 'recent'
      ? (a, b) => (lastActivity[b.id] || 0) - (lastActivity[a.id] || 0) || a.name.localeCompare(b.name)
      : (a, b) => a.name.localeCompare(b.name));
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

  const searching = query.trim().length > 0;

  return (
    <div className='document-tools'>
      <div className='folders__searchbar'>
        <Icon name='search' size={16} />
        <input
          type='search'
          className='folders__search'
          placeholder='Search folders, documents and signature requests'
          aria-label='Search documents'
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
        />
      </div>
      {searching ? (
        <DocumentSearch
          query={query.trim()}
          folders={folders}
          documents={documents || []}
          requests={requests}
          pathOf={(id) => folderPath(folders, id)}
          nameOf={nameOf}
          onOpenFolder={(id) => {
            setQuery('');
            open(id);
          }}
        />
      ) : (
      <>
      <FolderBrowser
        sort={sort}
        onSortChange={changeSort}
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
      </>
      )}
    </div>
  );
};

export default DocumentTools;
