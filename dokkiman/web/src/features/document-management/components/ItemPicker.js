/**
 * Item Picker
 * A window listing every document and signature request, wherever it is (the
 * top level or any folder), to tick the ones to put in a folder. Searchable,
 * and each item says where it is now. Items already in the target folder are
 * shown but can't be ticked.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../../shared';
import { REQUEST_STATUS } from '../../e-sign/fields';
import { matches } from './DocumentSearch';

const ItemPicker = ({
  title, confirmLabel, documents, requests, nameOf, whereOf, targetFolderId = null,
  initialDocumentIds = [], initialRequestIds = [], onConfirm, onClose, allowEmpty = false,
}) => {
  const [query, setQuery] = useState('');
  const [documentIds, setDocumentIds] = useState(() => new Set(initialDocumentIds));
  const [requestIds, setRequestIds] = useState(() => new Set(initialRequestIds));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKeyDown = (e) => e.key === 'Escape' && !isSaving && onClose();
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, isSaving]);

  const shownDocuments = useMemo(
    () => documents.filter((d) => matches(`${nameOf(d)} ${whereOf(d.folder_id)}`, query)),
    [documents, query, nameOf, whereOf]
  );
  const shownRequests = useMemo(
    () => requests.filter((r) => matches(
      `${r.title} ${r.signers.map((s) => `${s.name} ${s.email}`).join(' ')} ${whereOf(r.folder_id)}`, query
    )),
    [requests, query, whereOf]
  );

  const isHere = (item) => targetFolderId !== null && (item.folder_id || null) === targetFolderId;
  const toggle = (setter) => (id) => setter((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const total = documentIds.size + requestIds.size;

  const confirm = async () => {
    setIsSaving(true);
    setError('');
    try {
      await onConfirm({ documentIds: [...documentIds], requestIds: [...requestIds] });
    } catch (err) {
      setError(err.message);
      setIsSaving(false);
    }
  };

  const row = (item, kind) => {
    const checked = kind === 'document' ? documentIds.has(item.id) : requestIds.has(item.id);
    const here = isHere(item);
    const name = kind === 'document' ? nameOf(item) : item.title;
    return (
      <li key={`${kind}-${item.id}`}>
        <label className={`item-picker__row ${here ? 'item-picker__row--here' : ''}`}>
          <input
            type='checkbox'
            checked={checked || here}
            disabled={here || isSaving}
            onChange={() => (kind === 'document' ? toggle(setDocumentIds) : toggle(setRequestIds))(item.id)}
          />
          <span className={`search-results__icon search-results__icon--${kind === 'document' ? 'file' : 'request'}`}
            aria-hidden='true'>
            <Icon name={kind === 'document' ? 'file' : 'pen'} size={15} />
          </span>
          <span className='item-picker__text'>
            <span className='item-picker__name'>{name}</span>
            <span className='item-picker__where'>
              {here ? 'Already in this folder' : whereOf(item.folder_id)}
              {kind === 'request' && ` · ${REQUEST_STATUS[item.status] || item.status}`}
            </span>
          </span>
        </label>
      </li>
    );
  };

  return createPortal(
    <div className='upgrade-overlay' onClick={() => !isSaving && onClose()}>
      <div
        className='upgrade-dialog item-picker'
        role='dialog'
        aria-modal='true'
        aria-labelledby='item-picker-title'
        onClick={(e) => e.stopPropagation()}
      >
        <button type='button' className='upgrade-dialog__close' onClick={onClose} aria-label='Close' disabled={isSaving}>
          ×
        </button>
        <h2 id='item-picker-title' className='upgrade-dialog__title'>{title}</h2>
        <input
          type='search'
          className='folder-picker__search'
          placeholder='Search documents and signature requests'
          aria-label='Search documents to add'
          value={query}
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className='item-picker__lists'>
          {shownDocuments.length > 0 && (
            <section aria-label='Documents'>
              <h3 className='folders__heading'>Documents</h3>
              <ul className='item-picker__list'>{shownDocuments.map((d) => row(d, 'document'))}</ul>
            </section>
          )}
          {shownRequests.length > 0 && (
            <section aria-label='Signature requests'>
              <h3 className='folders__heading'>Signature requests</h3>
              <ul className='item-picker__list'>{shownRequests.map((r) => row(r, 'request'))}</ul>
            </section>
          )}
          {shownDocuments.length === 0 && shownRequests.length === 0 && (
            <p className='item-picker__none'>
              {documents.length + requests.length === 0 ? 'You have no documents yet.' : 'Nothing matches.'}
            </p>
          )}
        </div>
        {error && <p className='folders__error' role='alert'>{error}</p>}
        <div className='item-picker__footer'>
          <span className='item-picker__count' role='status'>
            {total === 0 ? 'Nothing selected' : `${total} selected`}
          </span>
          <button type='button' className='folders__btn' onClick={onClose} disabled={isSaving}>Cancel</button>
          <button type='button' className='folders__btn folders__btn--primary' onClick={confirm}
            disabled={isSaving || (total === 0 && !allowEmpty)}>
            {isSaving ? 'Saving…' : confirmLabel(total)}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ItemPicker;
