/**
 * Document Picker
 * "Upload from Document Manager" button plus a dialog listing the user's uploaded
 * documents. Picking one downloads its stored original and hands it to
 * onSelect(file, document) as a File, like choosing it from the computer.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import { apiFetch, readApiError } from '../services/apiClient';

const MIME_TYPES = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const extensionOf = (name = '') => {
  const match = name.toLowerCase().match(/\.[a-z0-9]+$/);
  return match ? match[0] : '';
};

const formatSize = (bytes) => {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
};

const formatDate = (timestamp) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString();
};

const DocumentPicker = ({
  acceptedExtensions = ['.pdf'],
  onSelect,
  // Chat can use a document even if only its indexed text is stored
  allowWithoutFile = false,
  // Whether a picked document's original should be downloaded (chat only
  // needs it for PDFs, which it shows page by page)
  needsFile = () => true,
  disabled = false,
  label = 'Upload from Document Manager',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [documents, setDocuments] = useState(null);
  const [error, setError] = useState('');
  const [loadingId, setLoadingId] = useState(null);

  const close = useCallback(() => {
    setIsOpen(false);
    setError('');
    setLoadingId(null);
  }, []);

  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;
    setDocuments(null);
    apiFetch('/getDocuments')
      .then(async (response) => {
        if (!response.ok) throw new Error(await readApiError(response, 'Could not load your documents.'));
        return response.json();
      })
      .then((list) => !cancelled && setDocuments(list))
      .catch((err) => !cancelled && setError(err.message));

    const onKeyDown = (e) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKeyDown);
    return () => {
      cancelled = true;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, close]);

  const matching = (documents || []).filter((doc) =>
    acceptedExtensions.includes(extensionOf(doc.filename))
  );

  const pick = async (doc) => {
    setError('');
    if (!doc.has_file || !needsFile(doc)) {
      onSelect(null, doc);
      close();
      return;
    }
    setLoadingId(doc.id);
    try {
      const response = await apiFetch(`/documents/${encodeURIComponent(doc.id)}/file`);
      if (!response.ok) throw new Error(await readApiError(response, 'Could not open this document.'));
      const blob = await response.blob();
      const file = new File([blob], doc.filename, {
        type: MIME_TYPES[extensionOf(doc.filename)] || blob.type,
      });
      onSelect(file, doc);
      close();
    } catch (err) {
      setError(err.message);
      setLoadingId(null);
    }
  };

  const typeLabel = acceptedExtensions.map((ext) => ext.slice(1).toUpperCase()).join(' or ');

  return (
    <>
      <button
        type='button'
        className='doc-picker-trigger'
        onClick={() => setIsOpen(true)}
        disabled={disabled}
      >
        {label}
      </button>

      {isOpen && createPortal(
        <div className='doc-picker-overlay' onClick={close} data-testid='doc-picker-overlay'>
          <div
            className='doc-picker'
            role='dialog'
            aria-modal='true'
            aria-labelledby='doc-picker-title'
            onClick={(e) => e.stopPropagation()}
          >
            <div className='doc-picker__header'>
              <h2 id='doc-picker-title' className='doc-picker__title'>Choose from Document Manager</h2>
              <button type='button' className='doc-picker__close' onClick={close} aria-label='Close'>
                ×
              </button>
            </div>

            {error && (
              <div className='doc-picker__error' role='alert'>
                <Icon name='alert' size={16} />
                <span>{error}</span>
              </div>
            )}

            {documents === null && !error && (
              <div className='doc-picker__state'>
                <span className='doc-picker__spinner' aria-hidden='true' />
                Loading your documents…
              </div>
            )}

            {documents !== null && matching.length === 0 && (
              <div className='doc-picker__state'>
                No {typeLabel} files in your Document Manager yet. Upload one there first.
              </div>
            )}

            {matching.length > 0 && (
              <ul className='doc-picker__list'>
                {matching.map((doc) => {
                  const usable = doc.has_file || allowWithoutFile;
                  const details = [formatSize(doc.file_size), formatDate(doc.processing_timestamp)]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <li key={doc.id}>
                      <button
                        type='button'
                        className='doc-picker__item'
                        onClick={() => pick(doc)}
                        disabled={!usable || loadingId !== null}
                      >
                        <span className='doc-picker__icon' aria-hidden='true'>
                          <Icon name='file' size={18} />
                        </span>
                        <span className='doc-picker__text'>
                          <span className='doc-picker__name'>{doc.filename}</span>
                          <span className='doc-picker__details'>
                            {usable
                              ? details
                              : 'Original file not stored. Upload it again to use it here.'}
                          </span>
                        </span>
                        {loadingId === doc.id && <span className='doc-picker__spinner' aria-label='Opening' />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default DocumentPicker;
