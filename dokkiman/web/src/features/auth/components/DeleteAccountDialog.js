/**
 * Delete Account Dialog
 * Explains what deleting removes, asks the person to type DELETE, then deletes
 * the account (DELETE /account) and signs them out.
 */

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../../../shared/components/Icon';
import { apiFetch, readApiError } from '../../../shared/services/apiClient';
import { openBillingPortal } from '../../pricing/billing';
import { useAuth } from '../context/AuthContext';

const CONFIRMATION = 'DELETE';

const DeleteAccountDialog = ({ onClose }) => {
  const { user, logout } = useAuth();
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const onKeyDown = (e) => e.key === 'Escape' && !isDeleting && onClose();
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, isDeleting]);

  const confirmed = typed.trim().toUpperCase() === CONFIRMATION;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!confirmed) return;
    setIsDeleting(true);
    setError('');
    try {
      const response = await apiFetch('/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: CONFIRMATION }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setErrorCode(data.code || '');
        throw new Error(data.error || await readApiError(response, 'Your account couldn’t be deleted.'));
      }
      // The server already ended the session; this clears the app and goes home
      await logout();
    } catch (err) {
      setError(err.message);
      setIsDeleting(false);
    }
  };

  return createPortal(
    <div className='upgrade-overlay' onClick={() => !isDeleting && onClose()}>
      <div
        className='upgrade-dialog account-dialog'
        role='dialog'
        aria-modal='true'
        aria-labelledby='delete-account-title'
        onClick={(e) => e.stopPropagation()}
      >
        <button type='button' className='upgrade-dialog__close' onClick={onClose} aria-label='Close' disabled={isDeleting}>
          ×
        </button>
        <h2 id='delete-account-title' className='upgrade-dialog__title'>Delete your account?</h2>
        <p className='upgrade-dialog__intro'>
          This permanently deletes <strong>{user?.email}</strong> and everything in it. It can&apos;t be undone.
        </p>
        <ul className='account-dialog__list'>
          <li>All your documents and uploaded files</li>
          <li>Your folders</li>
          <li>Documents you sent for signature, including signed copies and certificates (download any you need first)</li>
          <li>Your signing records and usage history</li>
        </ul>
        <p className='account-dialog__note'>
          Billing records stay with our payment provider, as the law requires. Backups are cleared within 40 days.
        </p>

        <form className='auth-form' onSubmit={handleSubmit} noValidate>
          <div className='auth-form__field'>
            <label className='auth-form__label' htmlFor='delete-confirm'>
              Type <strong>{CONFIRMATION}</strong> to confirm
            </label>
            <input
              id='delete-confirm'
              className='auth-form__input'
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete='off'
              autoFocus
            />
          </div>

          {error && (
            <div className='auth-form__error' role='alert'>
              <Icon name='alert' size={16} />
              <span>{error}</span>
            </div>
          )}
          {errorCode === 'subscription_active' && (
            <button
              type='button'
              className='upgrade-dialog__secondary'
              onClick={() => openBillingPortal().catch((err) => setError(err.message))}
            >
              Open Manage billing
            </button>
          )}

          <button type='submit' className='auth-form__submit auth-form__submit--danger' disabled={!confirmed || isDeleting}>
            {isDeleting && <span className='auth-form__spinner' aria-hidden='true' />}
            Delete my account
          </button>
        </form>
      </div>
    </div>,
    document.body
  );
};

export default DeleteAccountDialog;
