/**
 * Change Password Dialog
 * Asks for the current password and a new one. Other devices are signed out.
 */

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../../../shared/components/Icon';
import { useAuth } from '../context/AuthContext';
import { passwordProblem } from '../passwordRules';
import PasswordInput, { PasswordChecklist } from './PasswordInput';

const ChangePasswordDialog = ({ onClose }) => {
  const { user, changePassword } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    const onKeyDown = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSaving) return;
    setError('');
    const problem = passwordProblem(next, user?.email);
    if (problem) {
      setError(problem);
      return;
    }
    if (next !== confirm) {
      setError("The new passwords don't match.");
      return;
    }
    setIsSaving(true);
    try {
      await changePassword(current, next);
      setIsDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return createPortal(
    <div className='upgrade-overlay' onClick={onClose}>
      <div
        className='upgrade-dialog account-dialog'
        role='dialog'
        aria-modal='true'
        aria-labelledby='change-password-title'
        onClick={(e) => e.stopPropagation()}
      >
        <button type='button' className='upgrade-dialog__close' onClick={onClose} aria-label='Close'>
          ×
        </button>
        <h2 id='change-password-title' className='upgrade-dialog__title'>Change password</h2>

        {isDone ? (
          <>
            <div className='account-dialog__done' role='status'>
              <Icon name='checkCircle' size={18} />
              <span>Password changed. You&apos;ve been signed out on your other devices.</span>
            </div>
            <button type='button' className='upgrade-dialog__cta' onClick={onClose}>Done</button>
          </>
        ) : (
          <form className='auth-form' onSubmit={handleSubmit} noValidate>
            <div className='auth-form__field'>
              <label className='auth-form__label' htmlFor='current-password'>Current password</label>
              <PasswordInput
                id='current-password'
                value={current}
                onChange={setCurrent}
                autoComplete='current-password'
              />
            </div>
            <div className='auth-form__field'>
              <label className='auth-form__label' htmlFor='new-password'>New password</label>
              <PasswordInput
                id='new-password'
                value={next}
                onChange={setNext}
                autoComplete='new-password'
                describedBy='new-password-checks'
              />
              <PasswordChecklist id='new-password-checks' password={next} email={user?.email} />
            </div>
            <div className='auth-form__field'>
              <label className='auth-form__label' htmlFor='confirm-password'>Confirm new password</label>
              <PasswordInput
                id='confirm-password'
                value={confirm}
                onChange={setConfirm}
                autoComplete='new-password'
              />
            </div>
            <p className='account-dialog__note'>You&apos;ll stay signed in here. Other devices will be signed out.</p>

            {error && (
              <div className='auth-form__error' role='alert'>
                <Icon name='alert' size={16} />
                <span>{error}</span>
              </div>
            )}

            <button
              type='submit'
              className='auth-form__submit'
              disabled={isSaving || !current || !next || !confirm}
            >
              {isSaving && <span className='auth-form__spinner' aria-hidden='true' />}
              Change password
            </button>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
};

export default ChangePasswordDialog;
