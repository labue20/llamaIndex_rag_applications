/**
 * Account Menu
 * The signed-in user's avatar and email; opens a menu with Log out (and Change password
 * for accounts that have a password)
 */

import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import ChangePasswordDialog from './ChangePasswordDialog';
import { openBillingPortal } from '../../pricing/billing';

const AccountMenu = () => {
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [billingError, setBillingError] = useState('');
  const menuRef = useRef(null);
  const buttonRef = useRef(null);

  // Close on a click outside or Escape (returning focus to the button)
  useEffect(() => {
    if (!isOpen) return undefined;
    const onPointerDown = (e) => {
      if (!menuRef.current?.contains(e.target)) setIsOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  if (!user) return null;

  return (
    <div className='user-menu account-menu' ref={menuRef}>
      <button
        type='button'
        ref={buttonRef}
        className='account-menu__button'
        aria-haspopup='menu'
        aria-expanded={isOpen}
        aria-label={`Account: ${user.email}`}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className='user-menu__avatar' aria-hidden='true'>{user.email.charAt(0)}</span>
        <span className='user-menu__email' aria-hidden='true'>{user.email}</span>
        <span className='account-menu__caret' aria-hidden='true'>▾</span>
      </button>

      {isOpen && (
        <div className='account-menu__panel' role='menu'>
          <p className='account-menu__signed-in'>
            Signed in as <strong>{user.email}</strong>
          </p>
          {/* Accounts that have paid through Stripe: cancel, change card, invoices */}
          {user.plan?.billing && (
            <button
              type='button'
              role='menuitem'
              className='account-menu__item'
              onClick={() => openBillingPortal().catch((err) => setBillingError(err.message))}
            >
              Manage billing
            </button>
          )}
          {billingError && <p className='account-menu__error' role='alert'>{billingError}</p>}
          {/* Google accounts have no password here */}
          {user.has_password && (
            <button
              type='button'
              role='menuitem'
              className='account-menu__item'
              onClick={() => {
                setIsOpen(false);
                setIsChangingPassword(true);
              }}
            >
              Change password
            </button>
          )}
          <button type='button' role='menuitem' className='account-menu__item' onClick={logout}>
            Log out
          </button>
        </div>
      )}

      {isChangingPassword && <ChangePasswordDialog onClose={() => setIsChangingPassword(false)} />}
    </div>
  );
};

export default AccountMenu;
