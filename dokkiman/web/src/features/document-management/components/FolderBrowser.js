/**
 * Folder Browser
 * The top of the Document Manager: where you are ("All documents › Willow
 * Lane"), the folders here (open, rename, delete, New folder), and the
 * signature requests filed here, with the signed PDF and certificate once
 * everyone has signed.
 */

import React, { useState } from 'react';
import { Icon } from '../../../shared';
// Straight from the modules (not the e-sign index) to avoid an import cycle
import { downloadRequestDocument } from '../../e-sign/requestsApi';
import ItemPicker from './ItemPicker';
import { REQUEST_STATUS } from '../../e-sign/fields';

const count = (number, word) => `${number} ${word}${number === 1 ? '' : 's'}`;

// "2 documents and 1 signature request"
const describeSelection = ({ documentIds, requestIds }) => [
  documentIds.length && count(documentIds.length, 'document'),
  requestIds.length && count(requestIds.length, 'signature request'),
].filter(Boolean).join(' and ');

const NewFolderForm = ({ onCreate, onCancel, pickerProps }) => {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Documents and requests to move into the new folder (optional)
  const [selection, setSelection] = useState({ documentIds: [], requestIds: [] });
  const [isPicking, setIsPicking] = useState(false);
  const chosen = describeSelection(selection);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onCreate(name, selection);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form className='folders__new' onSubmit={submit}>
      <input
        className='folders__input'
        aria-label='Folder name'
        placeholder='Folder name, e.g. 214 Willow Lane'
        value={name}
        maxLength={80}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
      />
      <button type='button' className='folders__btn' onClick={() => setIsPicking(true)} disabled={busy}>
        {chosen ? `Change documents (${selection.documentIds.length + selection.requestIds.length})` : 'Choose documents…'}
      </button>
      <button type='submit' className='folders__btn folders__btn--primary' disabled={busy || !name.trim()}>
        {busy ? 'Creating…' : 'Create'}
      </button>
      <button type='button' className='folders__btn' onClick={onCancel} disabled={busy}>Cancel</button>
      {chosen && <p className='folders__hint'>{chosen} will be moved into the new folder.</p>}
      {error && <p className='folders__error' role='alert'>{error}</p>}
      {isPicking && (
        <ItemPicker
          {...pickerProps}
          title='Choose documents for the new folder'
          confirmLabel={(n) => (n ? `Use ${n} selected` : 'Continue without documents')}
          allowEmpty
          initialDocumentIds={selection.documentIds}
          initialRequestIds={selection.requestIds}
          onClose={() => setIsPicking(false)}
          onConfirm={async (picked) => {
            setSelection(picked);
            setIsPicking(false);
          }}
        />
      )}
    </form>
  );
};

const RequestRow = ({ request }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const signed = request.signers.filter((s) => s.status === 'signed').length;
  const download = async (part) => {
    setBusy(true);
    setError('');
    try {
      await downloadRequestDocument(request, part);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className='folders__request'>
      <span className='folders__request-icon' aria-hidden='true'><Icon name='pen' size={16} /></span>
      <span className='folders__request-text'>
        <span className='folders__request-title'>{request.title}</span>
        <span className='folders__request-meta'>
          {request.signers.map((s) => s.name).join(', ')}
          {request.status === 'sent' && ` · ${signed} of ${request.signers.length} signed`}
        </span>
      </span>
      <span className={`esign-status esign-status--${request.status}`}>
        {REQUEST_STATUS[request.status] || request.status}
      </span>
      {request.status === 'completed' && (
        <span className='folders__request-actions'>
          <button type='button' className='folders__btn' onClick={() => download('signed')} disabled={busy}>
            Signed PDF
          </button>
          <button type='button' className='folders__btn' onClick={() => download('certificate')} disabled={busy}>
            Certificate
          </button>
        </span>
      )}
      {error && <span className='folders__error' role='alert'>{error}</span>}
    </li>
  );
};

const FolderBrowser = ({
  folders, currentFolder, trail, subfolders, onOpen, onCreate, onRename, onDelete, error, uploadButton,
  sort = 'name', onSortChange, pickerProps, onAddItems,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  // One level of subfolders: new folders can be made at the top and inside a top folder
  const canCreate = !currentFolder || !currentFolder.parent_id;

  return (
    <div className='folders'>
      <div className='folders__bar'>
        <nav className='folders__trail' aria-label='Folder path'>
          <button type='button' className='folders__crumb' onClick={() => onOpen(null)}
            aria-current={!currentFolder ? 'page' : undefined}>
            <Icon name='folder' size={15} /> All documents
          </button>
          {trail.map((folder) => (
            <React.Fragment key={folder.id}>
              <span className='folders__sep' aria-hidden='true'>›</span>
              <button type='button' className='folders__crumb' onClick={() => onOpen(folder.id)}
                aria-current={folder.id === currentFolder?.id ? 'page' : undefined}>
                {folder.name}
              </button>
            </React.Fragment>
          ))}
        </nav>
        <div className='folders__actions'>
          {canCreate && !isCreating && (
            <button type='button' className='folders__btn' onClick={() => setIsCreating(true)}>
              + New folder
            </button>
          )}
          {currentFolder && pickerProps && (
            <button type='button' className='folders__btn' onClick={() => setIsAdding(true)}>
              Add documents
            </button>
          )}
          {uploadButton}
        </div>
      </div>

      {isCreating && (
        <NewFolderForm
          pickerProps={pickerProps}
          onCancel={() => setIsCreating(false)}
          onCreate={async (name, selection) => {
            await onCreate(name, selection);
            setIsCreating(false);
          }}
        />
      )}
      {isAdding && currentFolder && (
        <ItemPicker
          {...pickerProps}
          title={`Add documents to ${currentFolder.name}`}
          confirmLabel={(n) => (n ? `Move ${n} here` : 'Move here')}
          targetFolderId={currentFolder.id}
          onClose={() => setIsAdding(false)}
          onConfirm={async (picked) => {
            await onAddItems(currentFolder.id, picked);
            setIsAdding(false);
          }}
        />
      )}
      {error && <p className='folders__error' role='alert'>{error}</p>}

      {subfolders.length > 1 && onSortChange && (
        <div className='folders__sort'>
          <label htmlFor='folder-sort'>Sort folders</label>
          <select id='folder-sort' value={sort} onChange={(e) => onSortChange(e.target.value)}>
            <option value='name'>A–Z</option>
            <option value='recent'>Recently used</option>
          </select>
        </div>
      )}

      {subfolders.length > 0 && (
        <ul className='folders__list' aria-label='Folders'>
          {subfolders.map((folder) => {
            const inside = folders.filter((f) => f.parent_id === folder.id).length;
            const parts = [
              inside && count(inside, 'folder'),
              count(folder.document_count, 'document'),
              folder.request_count && count(folder.request_count, 'signature request'),
            ].filter(Boolean);
            return (
              <li key={folder.id} className='folders__item'>
                <button type='button' className='folders__open' onClick={() => onOpen(folder.id)}>
                  <span className='folders__icon' aria-hidden='true'><Icon name='folder' size={18} /></span>
                  <span className='folders__name'>{folder.name}</span>
                  <span className='folders__meta'>{parts.join(' · ')}</span>
                </button>
                <span className='folders__item-actions'>
                  <button type='button' className='folders__link' aria-label={`Rename ${folder.name}`}
                    onClick={() => onRename(folder)}>
                    Rename
                  </button>
                  <button type='button' className='folders__link folders__link--danger'
                    aria-label={`Delete ${folder.name}`} onClick={() => onDelete(folder)}>
                    Delete
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

/** The signature requests filed in the open folder, with the signed PDF and certificate once done. */
export const RequestList = ({ requests }) => (requests.length > 0 ? (
  <section className='folders folders__requests' aria-labelledby='folder-requests-title'>
    <h3 id='folder-requests-title' className='folders__heading'>Signature requests</h3>
    <ul className='folders__request-list'>
      {requests.map((request) => <RequestRow key={request.id} request={request} />)}
    </ul>
  </section>
) : null);

export default FolderBrowser;
